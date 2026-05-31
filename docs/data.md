# Meridian — Data Sources & Pipeline

## Sources

| Dataset | Delivery | Records | Used for |
|---------|----------|---------|----------|
| **Heritage Register** (CKAN `heritage-register`) | Shapefile ZIP, WGS84 — no datastore API | ~12,320 | Heritage designation risk (Part IV / Part V / Listed) |
| **Development Applications** (CKAN `development-applications`) | CSV via datastore API (`datastore_active`), paginated | ~25,400 | Neighbourhood development pressure within 500 m |
| **TRCA Floodlines** (TRCA ArcGIS FeatureServer) | GeoJSON polygon query, live per-address | n/a | Flood-zone intersection + insurance loading |

CKAN base URL: `https://ckan0.cf.opendata.inter.prod-toronto.ca`. Floodlines come from the TRCA ArcGIS service (`trca_flood_query_url` in `config.py`) and are **not materialized** — they are queried live per report request.

## Official vs Assumed

**Official (from authoritative sources):**
- Ontario and Toronto Land Transfer Tax brackets and rebates (Ontario: up to $4,000 first-time; Toronto MLTT: up to $4,475)
- Property tax rate: `0.00767311` (City of Toronto residential 2026)
- Heritage status flags from the Toronto Heritage Register
- Flood risk from TRCA floodline polygons
- Development activity counts from City open data

**Assumed / heuristic proxies (not official figures):**
- `assessed_value_proxy = list_price × 0.60` (MPAC assessment is not available live)
- Flood carrying-cost loading: `+$3,500/year`
- Car-dependent baseline transport cost: `~$12,000/year`
- Development-density signal threshold: 10+ active applications within 500 m
- Transit dividend: proximity-based savings applied when within 400 m of a TTC stop

All heuristic loadings are documented in `docs/frontend-parameters.md`. The report surfaces a `warnings` field when heuristics are used in place of live data.

## Pipeline Flow

```
POST /api/v1/pipeline/refresh
  ├─ heritage:    shp_fetcher.fetch_shp_points("heritage-register")
  │               download SHP ZIP → read .shp/.dbf/.shx with pyshp → dict records (WGS84 lat/lon)
  └─ development: ckan_fetcher.fetch_all("development-applications")
                  datastore_search pagination at 5,000 rows/page
        │  (both run concurrently via asyncio.gather)
        ▼
  _write_parquet()  →  data/parquet/{dataset}_{timestamp}.parquet   (raw snapshot)
        ▼
  DuckDBStore.load_parquet()  →  {dataset}_raw table
        ▼
  {heritage,development}_cleaner.run()  →  heritage / development tables (cleaned, standardized)
        ▼
  pipeline_runs table  (audit row: rows, status, warnings, timing)
```

Code paths: `app/api/routes/pipeline.py`, `app/services/pipeline/{ckan_fetcher,shp_fetcher,heritage_cleaner,development_cleaner,duckdb_store}.py`.

## Fetching Details

**`ckan_fetcher.fetch_all(package_id)`** — resolves the package's `datastore_active` resource, then pages `datastore_search` at 5,000 rows/request until exhausted.

**`shp_fetcher.fetch_shp_points(package_id)`** — the Heritage Register is published only as a zipped shapefile (there is no datastore resource; `datastore_search` returns 404). Downloads the ZIP, reads `.shp/.dbf/.shx` with `pyshp`, and emits plain dict records with `latitude`/`longitude` from point geometry (already WGS84), shaped like datastore output so the cleaner is source-agnostic.

## Cleaning & Standardization

Both cleaners use `_pick` / `_pick_optional` helpers to locate columns by candidate name lists — CKAN column names drift between exports.

**Development (`development_cleaner.py`):**
1. **Address composition** — no single address column; address is built from `street_num + street_name + street_type + street_direction`, whitespace-collapsed and title-cased.
2. **Coordinate reprojection** — `x`/`y` values are projected NAD83 MTM Zone 10 (EPSG:2952) eastings/northings, not lat/lon. They are reprojected to WGS84 (EPSG:4326) using `pyproj`. A magnitude check leaves already-geographic values untouched. **This was a critical correctness fix** — before reprojection, projected metres were stored as latitude and no spatial match ever succeeded.
3. **Validation** — rows with missing or uncastable coordinates are dropped; coordinates are clipped to the Greater Toronto bounding box (43.4–44.0 N, −79.8–−79.0 W).
4. **Status normalization** — boolean `active` flag derived from status text; inactive set: withdrawn/closed/lapsed/refused/cancelled/appeal dismissed/appeal withdrawn.
5. **Deduplication** — deduped by record ID; `DELETE + INSERT OR REPLACE` so re-runs are idempotent.

**Heritage (`heritage_cleaner.py`):**
1. **Status canonicalization** — free-text `STATUS` → `part_iv` / `part_v` / `listed` / `removed` via `_STATUS_MAP`.
2. **Type coercion** — `TRY_CAST` lat/lon to double; rows without coordinates are dropped.
3. **Idempotent bulk load** — `DELETE + executemany INSERT OR REPLACE`.

## DuckDB Schema

Database file: `data/meridian.duckdb` (singleton via `duckdb_store.py`).

```sql
-- Materialized by pipeline/refresh
CREATE TABLE heritage (
    record_id  VARCHAR PRIMARY KEY,
    address    VARCHAR,
    status     VARCHAR,   -- part_iv | part_v | listed | removed
    latitude   DOUBLE,
    longitude  DOUBLE,
    loaded_at  TIMESTAMP
);
CREATE INDEX heritage_geo ON heritage (latitude, longitude);

CREATE TABLE development (
    record_id       VARCHAR PRIMARY KEY,
    address         VARCHAR,
    status          VARCHAR,
    active          BOOLEAN,
    submitted_date  DATE,
    decision_date   DATE,
    latitude        DOUBLE,
    longitude       DOUBLE,
    loaded_at       TIMESTAMP
);
CREATE INDEX development_geo ON development (latitude, longitude);

CREATE TABLE pipeline_runs (
    run_id            VARCHAR PRIMARY KEY,
    started_at        TIMESTAMP,
    finished_at       TIMESTAMP,
    heritage_rows     INTEGER,
    development_rows  INTEGER,
    status            VARCHAR,
    error_message     VARCHAR
);

-- Created by AppStore (memory/profile layer)
CREATE TABLE user_profile (
    id              INTEGER PRIMARY KEY,   -- always 1 (single local user)
    name            VARCHAR,
    email           VARCHAR,
    phone           VARCHAR,
    monthly_income  DOUBLE,
    updated_at      TIMESTAMP DEFAULT current_timestamp
);

CREATE TABLE saved_reports (
    report_id     VARCHAR PRIMARY KEY,
    address       VARCHAR,
    list_price    DOUBLE,
    buyer_profile VARCHAR,
    true_10y_cost INTEGER,
    payload       JSON,
    created_at    TIMESTAMP DEFAULT current_timestamp
);

CREATE TABLE chat_turns (
    turn_id    VARCHAR PRIMARY KEY,
    session_id VARCHAR,
    role       VARCHAR,   -- "user" | "assistant"
    content    VARCHAR,
    created_at TIMESTAMP DEFAULT current_timestamp
);
```

Raw snapshots also land in `data/parquet/` for reproducibility and ad-hoc analysis.

## Query Path (How Reports Read the Data)

`data_sources/heritage.py` and `data_sources/development.py`:
1. Bounding-box pre-filter in SQL (cheap index scan), then a precise haversine within-radius check (GPU via cuSpatial in `services/gpu/spatial.py`, numpy fallback). Heritage match radius: 80 m; development pressure: 500 m.
2. **Graceful degradation** — if DuckDB tables are empty (pipeline not yet run) or a live source is unreachable, the service falls back to a heuristic estimate. The report surfaces a `warnings` entry (string match on `"heuristic"` in the source field). When the pipeline has run, sources read `duckdb-heritage` / `duckdb-development` with no warnings.

## Running the Pipeline

```bash
# Backend must be running first, then:
curl -X POST localhost:8000/api/v1/pipeline/refresh \
     -d '{}' -H 'Content-Type: application/json'
# → {"status":"success","heritage_rows":12320,"development_rows":25439,"warnings":[]}

# Verify a known heritage address resolves from live data:
curl "localhost:8000/api/v1/debug/heritage?address=17 Salisbury Ave, Toronto"
# → {"status":"part_v", ..., "source":"duckdb-heritage"}

# Check pipeline run history via DuckDB:
python -c "import duckdb; c=duckdb.connect('backend/data/meridian.duckdb'); print(c.execute('SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 5').df())"
```

Dependencies: `pyproj` (coordinate reprojection) and `pyshp` (shapefile reading) are declared in `backend/pyproject.toml`.
