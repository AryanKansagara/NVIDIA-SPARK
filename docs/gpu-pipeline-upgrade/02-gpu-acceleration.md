# Phase 2 — GPU Acceleration (RAPIDS + CuPy Monte Carlo)

## Goal

Replace the Python haversine `for` loop and single-number cost estimate with:
- GPU-accelerated spatial filtering via RAPIDS cuSpatial/cuDF (with numpy fallback)
- A 10,000-trajectory Monte Carlo simulation via CuPy (with numpy fallback) that produces P10/P50/P90 cost ranges

## New Files

### `backend/app/services/gpu/spatial.py`

Provides `find_within_radius(lat, lon, candidates_df, radius_m)`.

**GPU path** (when `cudf` + `cuspatial` are importable):
- Transfers candidate DataFrame to GPU memory via `cudf.DataFrame.from_pandas()`
- Runs haversine distance calculation on GPU
- Filters to rows within `radius_m` and returns as pandas DataFrame

**CPU fallback** (numpy vectorised, no Python loop):
```python
dlat = np.radians(lats - lat)
dlon = np.radians(lons - lon)
a = np.sin(dlat/2)**2 + np.cos(np.radians(lat)) * np.cos(np.radians(lats)) * np.sin(dlon/2)**2
dist = 6_371_000 * 2 * np.arcsin(np.sqrt(a))
return df[dist <= radius_m]
```

The try-import guard at module load time decides the path once:
```python
try:
    import cudf, cuspatial
    _GPU = True
except ImportError:
    _GPU = False
```

### `backend/app/services/gpu/monte_carlo.py`

`MonteCarloSimulator(n_sims, gpu_enabled)` with async `run()` method.

**Simulation model** — shape `(n_sims=10_000, years=10)`:

| Variable | Distribution |
|----------|-------------|
| Property-tax growth rate | `base_rate + N(0, 0.005) + 0.002 × dev_density_score` |
| Annual maintenance/reserve | `N(μ=8000, σ=2000)` |
| Annual insurance | `N(μ=3500, σ=500) + $1000` if in flood zone |
| Year-5 renewal rate shock | `N(0, 0.15)` drift applied to mortgage interest cost |

Each trajectory sums 10 years of costs → `(n_sims,)` vector → percentiles extracted.

```python
xp = cp if _GPU else np   # same code, different array backend
```

**Return type**:
```python
@dataclass
class MonteCarloResult:
    p10: int
    p50: int
    p90: int
    mean: int
    n: int
    elapsed_ms: float
```

## Installing RAPIDS (GPU path only)

The app runs without RAPIDS — all GPU paths fall back to CPU automatically. To enable GPU acceleration on a CUDA 12 machine:

**Conda (recommended on DGX Spark):**
```bash
conda install -c rapidsai -c conda-forge -c nvidia \
  cudf=24.12 cuspatial=24.12 cupy=13 python=3.11 cuda-version=12.0
```

**Pip:**
```bash
pip install cudf-cu12 cuspatial-cu12 cupy-cuda12x \
  --extra-index-url https://pypi.nvidia.com
```

Verify GPU is active:
```bash
python -c "import cudf; print('GPU OK:', cudf.__version__)"
```

## Schema Changes

Added to `backend/app/schemas/report.py`:

```python
class MonteCarloResult(BaseModel):
    p10: int
    p50: int
    p90: int
    mean: int
    trajectories_sampled: int
    elapsed_ms: float | None = None

class MapGeometry(BaseModel):
    property_lat: float
    property_lon: float
    flood_polygon_geojson: dict | None = None
    dev_pressure_radius_m: int = 500
```

`ReportResponse` gains both fields (nullable):
```python
monte_carlo: MonteCarloResult | None = None
map_geometry: MapGeometry | None = None
```

## Modified Files

| File | Change |
|------|--------|
| `backend/app/services/report_service.py` | Runs Monte Carlo after engine; builds `MapGeometry` from flood data; attaches both to response |
| `backend/app/services/data_sources/models.py` | Added `polygon_geojson: dict | None = None` to `FloodEvidence` |
| `backend/app/services/data_sources/flood.py` | Fetches GeoJSON polygon from TRCA ArcGIS with `returnGeometry=true`; stores in `FloodEvidence.polygon_geojson` |
| `backend/app/services/synthesis/service.py` | Passes Monte Carlo results to Nemotron context; synthesis paragraph 1 references P10/P90 range |
