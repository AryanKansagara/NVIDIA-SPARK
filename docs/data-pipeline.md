# Data Pipeline — City of Toronto Open Data

This document describes how Meridian pulls, cleans, standardizes, stores, and queries
the City of Toronto public datasets that back the live numbers in every report.
Everything runs **on-device** (DGX Spark) — no third-party data services.

## Sources (City of Toronto Open Data / CKAN)

| Dataset | CKAN package | Delivery | Records | Used for |
|---|---|---|---|---|
| Heritage Register | `heritage-register` | **Shapefile (zip), WGS84** — no datastore API | ~12,320 | Heritage designation risk (Part IV / Part V / Listed) |
| Development Applications | `development-applications` | **CSV via datastore API** (`datastore_active`) | ~25,400 | Neighbourhood development pressure within 500 m |
| TRCA Floodlines | TRCA ArcGIS FeatureServer | GeoJSON polygon query (live, per-address) | n/a | Flood-zone intersection + insurance loading |

CKAN base: `https://ckan0.cf.opendata.inter.prod-toronto.ca`. Floodlines come from the
TRCA ArcGIS service (`trca_flood_query_url` in `config.py`) and are queried live per request,
not materialized.

## Flow

```
POST /api/v1/pipeline/refresh
  ├─ heritage:    shp_fetcher.fetch_shp_points("heritage-register")     # download SHP zip, read with pyshp
  └─ development: ckan_fetcher.fetch_all("development-applications")     # datastore_search pagination (5000/page)
        │  (run concurrently via asyncio.gather)
        ▼
  _write_parquet()   → data/parquet/{dataset}_{ts}.parquet   (raw snapshot, keys lower_snake_case)
        ▼
  DuckDBStore.load_parquet() → {dataset}_raw table
        ▼
  {heritage,development}_cleaner.run()  → clean/standardize → heritage / development tables
        ▼
  pipeline_runs table records the run (rows, status, warnings, timing)
```

Code: `app/api/routes/pipeline.py`, `app/services/pipeline/{ckan_fetcher,shp_fetcher,heritage_cleaner,development_cleaner,duckdb_store}.py`.

## Fetching

- **`ckan_fetcher.fetch_all(package_id)`** — resolves the package's `datastore_active`
  resource, then pages `datastore_search` at 5000 rows/request until exhausted.
- **`shp_fetcher.fetch_shp_points(package_id)`** — the Heritage Register is published
  **only as a zipped shapefile** (there is no datastore resource, so `datastore_search`
  returns 404). This downloads the SHP zip, reads `.shp/.dbf/.shx` with `pyshp`, and
  emits plain dict records (attributes + `latitude`/`longitude` from the point geometry,
  already WGS84) shaped like datastore output so the cleaner is source-agnostic.

## Cleaning & standardization (best practices applied)

Both cleaners are **schema-agnostic** (open-data column names drift), using `_pick`/`_pick_optional`
to locate columns by candidate lists.

**Development (`development_cleaner.py`):**
1. **Address standardization** — the live dataset has no single address column, so the
   address is composed from `street_num` + `street_name` + `street_type` + `street_direction`,
   then whitespace-collapsed and title-cased. (Falls back to a single address column if present.)
2. **Coordinate standardization** — `x`/`y` ship as **projected NAD83 MTM Zone 10 (EPSG:2952)**
   eastings/northings, not lat/lon. They are **reprojected to WGS84 (EPSG:4326)** with `pyproj`.
   (A magnitude check leaves already-geographic values untouched.) This was a real correctness
   fix: before reprojection, projected metres were stored as latitude and **no spatial match
   ever succeeded**.
3. **Validation** — rows with missing/uncastable coordinates are dropped; coordinates are
   clipped to the Greater Toronto bounding box (43.4–44.0 N, −79.8–−79.0 W) as a quality guard.
4. **Status normalization** — a boolean `active` flag is derived from the status text
   (inactive set: withdrawn/closed/lapsed/refused/cancelled/appeal dismissed/appeal withdrawn).
5. **Dedupe + idempotent load** — deduped by record id; `DELETE` + `INSERT OR REPLACE` so
   re-runs never duplicate.

**Heritage (`heritage_cleaner.py`):**
1. **Status canonicalization** — free-text `STATUS` → `part_iv` / `part_v` / `listed` / `removed`
   via `_STATUS_MAP` (e.g. "Part V", "Heritage Conservation District" → `part_v`).
2. **Type coercion + null filtering** — `TRY_CAST` lat/lon to double; rows without coordinates dropped.
3. **Idempotent bulk load** — `DELETE` + `executemany INSERT OR REPLACE`.
   (A previous stray no-param `INSERT` left the table empty after the `DELETE`; fixed.)

## Storage (DuckDB)

`data/meridian.duckdb` (`duckdb_store.py`, singleton). Cleaned tables:

- `heritage(record_id PK, address, status, latitude, longitude, loaded_at)`
- `development(record_id PK, address, status, active, submitted_date, decision_date, latitude, longitude, loaded_at)`
- `pipeline_runs(run_id PK, started_at, finished_at, heritage_rows, development_rows, status, error_message)`

Raw snapshots also land in `data/parquet/` for reproducibility and ad-hoc analysis.

## Query path (how reports read the data)

`data_sources/heritage.py` and `development.py`:
1. Bounding-box pre-filter in SQL (cheap), then a precise **haversine within radius**
   (GPU via cuSpatial in `services/gpu/spatial.py`, numpy fallback). Heritage match radius 80 m;
   development pressure counts applications within 500 m.
2. **Graceful degradation** — if the DuckDB table is empty (pipeline not yet run) or a live
   source is unreachable, the service falls back to a heuristic and the report surfaces a
   `warnings` entry (string match on `heuristic` in the source field). When the pipeline has
   run, sources read `duckdb-heritage` / `duckdb-development` with **no warnings**.

## Running it

```bash
# Backend up, then materialize the datasets (~2–3 min over live CKAN/SHP):
curl -X POST localhost:8000/api/v1/pipeline/refresh -d '{}' -H 'Content-Type: application/json'
# → {"status":"success","heritage_rows":12320,"development_rows":25439,"warnings":[]}

# Verify a known heritage address resolves from live data:
curl "localhost:8000/api/v1/debug/heritage?address=17 Salisbury Ave, Toronto"
# → {"status":"part_v", ..., "source":"duckdb-heritage"}
```

Dependencies: `pyproj` (reprojection) and `pyshp` (shapefile reading) are declared in
`backend/pyproject.toml`.
