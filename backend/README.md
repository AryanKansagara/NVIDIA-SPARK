# Meridian Backend

FastAPI backend for the Meridian MVP.

## First Endpoints

- `GET /api/v1/health`
- `POST /api/v1/report`
- `GET /api/v1/debug/geocode?address=...`
- `GET /api/v1/debug/heritage?address=...`
- `GET /api/v1/debug/flood?address=...`
- `GET /api/v1/debug/development?address=...`

## Run

```bash
uvicorn app.main:app --reload
```

## Notes

- The deterministic engine is implemented first and owns numeric outputs.
- The geocoder uses a real HTTP geocoding provider by default.
- Datasource adapters currently return MVP evidence objects with a clean upgrade path to live Toronto and TRCA integrations.
