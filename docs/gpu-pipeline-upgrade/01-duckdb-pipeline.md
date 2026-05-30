# Phase 1 — DuckDB Data Pipeline

## Goal

Replace the in-memory Python list approach with a persistent DuckDB database backed by Parquet files. Data is fetched on demand via a `POST /api/v1/pipeline/refresh` endpoint rather than on every cold start.

## New Files

### `backend/app/services/pipeline/ckan_fetcher.py`

Handles paginated extraction from the Toronto Open Data CKAN API.

```
fetch_all(package_id, timeout) → list[dict]
```

- Pages through results 5000 records at a time
- Prefers `datastore_active` resources; falls back to CSV/JSON
- Used by the pipeline refresh endpoint for both Heritage and Development datasets

### `backend/app/services/pipeline/duckdb_store.py`

Singleton wrapper around the persistent DuckDB file at `backend/data/meridian.duckdb`.

Key methods:

| Method | Purpose |
|--------|---------|
| `get_store(db_path)` | Async factory, uses `asyncio.Lock` to prevent concurrent init |
| `load_parquet(table, path)` | `DROP + CREATE TABLE … FROM parquet_file()` |
| `execute(sql, params)` | Raw query passthrough |
| `fetchdf()` | Returns a pandas DataFrame |
| `has_table(name)` | Checks schema for table existence |
| `row_count(table)` | Returns `COUNT(*)` for a table |

### `backend/app/services/pipeline/heritage_cleaner.py`

Reads the raw `heritage_raw` table and writes a normalised `heritage` table.

- Normalises freeform status strings to: `part_iv`, `part_v`, `listed`, `removed`
- Uses `_pick()` helper for dynamic column detection (CKAN column names change between exports)
- Bulk inserts via `executemany`

### `backend/app/services/pipeline/development_cleaner.py`

Reads `development_raw`, writes `development` table.

- Derives `active` boolean (row is not in a terminal-status set)
- Parses submitted and decision dates from freeform strings
- Uses `_pick_optional()` for columns that may be absent in some CKAN exports

### `backend/app/api/routes/pipeline.py`

Registers `POST /api/v1/pipeline/refresh`.

Flow:

1. `asyncio.gather()` — fetches Heritage and Development concurrently
2. Writes each dataset to `backend/data/parquet/{dataset}_{timestamp}.parquet` via pyarrow
3. `COPY {table}_raw FROM '{path}' (FORMAT PARQUET)` into DuckDB
4. Runs cleaners for both tables
5. Inserts an audit row into `pipeline_runs`
6. Returns `PipelineRefreshResponse` with row counts, duration, and any warnings

Partial failures (one dataset fails) are reported in `warnings[]`; existing tables are left untouched.

### `backend/app/schemas/pipeline.py`

```python
class PipelineRefreshRequest(BaseModel):
    force: bool = False

class PipelineRefreshResponse(BaseModel):
    status: str
    heritage_rows: int
    development_rows: int
    duration_seconds: float
    refreshed_at: datetime
    parquet_paths: list[str]
    warnings: list[str]
```

## DuckDB Schema

```sql
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
    run_id        VARCHAR PRIMARY KEY,
    started_at    TIMESTAMP,
    finished_at   TIMESTAMP,
    heritage_rows INTEGER,
    development_rows INTEGER,
    status        VARCHAR,
    error_message VARCHAR
);
```

## Modified Files

| File | Change |
|------|--------|
| `backend/app/api/router.py` | Registered pipeline router |
| `backend/app/core/config.py` | Added `duckdb_path`, `parquet_dir`, `gpu_enabled`, `monte_carlo_n_sims` settings |
| `backend/app/services/data_sources/heritage.py` | Replaced `_records` list + Python loop with DuckDB bounding-box SQL + GPU spatial |
| `backend/app/services/data_sources/development.py` | Same pattern as heritage |
| `backend/pyproject.toml` | Added `duckdb>=1.0.0`, `pyarrow>=16.0.0`, `pandas` |

## Fallback Behaviour

If DuckDB tables are empty (pipeline never run) or a query errors, both `heritage.py` and `development.py` fall back to a heuristic estimate so the report still generates on a fresh install.
