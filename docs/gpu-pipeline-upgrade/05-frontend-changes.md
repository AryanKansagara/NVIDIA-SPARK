# Frontend Changes

All frontend changes are in Next.js 15 (TypeScript + Tailwind CSS).

## `frontend/lib/report.ts`

Added two new types to the shared report model:

```typescript
export type MonteCarloDistribution = {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  trajectoriesSampled: number;
  elapsedMs: number | null;
};

export type MapGeometry = {
  propertyLat: number;
  propertyLon: number;
  floodPolygonGeojson: Record<string, unknown> | null;
  devPressureRadiusM: number;
};
```

Extended `MeridianReport`:
```typescript
monteCarlo: MonteCarloDistribution | null;
mapGeometry: MapGeometry | null;
```

`buildPreviewReport()` returns both as `null` so the preview mode (API down) renders gracefully.

## `frontend/lib/api.ts`

Extended `BackendReport` with snake_case backend shapes, mapped in `mapReport()`:

```typescript
monte_carlo: { p10, p50, p90, mean, trajectories_sampled, elapsed_ms } | null;
map_geometry: { property_lat, property_lon, flood_polygon_geojson, dev_pressure_radius_m } | null;
```

## `frontend/lib/pipeline-api.ts` (new)

```typescript
export type PipelineStatus = {
  heritageRows: number;
  developmentRows: number;
  refreshedAt: Date;
  durationSeconds: number;
  warnings: string[];
};

export async function fetchPipelineRefresh(): Promise<PipelineStatus>
```

POSTs to `/api/v1/pipeline/refresh` and maps the response to `PipelineStatus`.

## `frontend/components/input-card.tsx`

Changes:
- **Removed** Down Payment %, Mortgage Rate, and Amortization Years fields — only Address, List Price, Buyer Profile remain
- Renamed "Recalculate Preview" button → "Generate Report"
- Added "Refresh Live Data" button with `Loader2` spinner (disabled while refreshing)
- Added status row below buttons: *"Data refreshed 14:32 · 12,431 heritage · 26,198 development"*
- New props: `onRefreshPipeline`, `pipelineStatus`, `isRefreshing`

## `frontend/components/summary-card.tsx`

- **Color fix**: changed from dark theme (`bg-[#18313C]`, `text-[#FFF9EF]`) to light theme matching the rest of the UI — `text-ink` for values, `text-slate` for labels, `bg-[#F7FAF8] border-[#D7E7E2]` for stat boxes
- Third stat box: when `report.monteCarlo` is available, shows P50 value with P10/P90 sub-text instead of "Mortgage Cases: 3"

## `frontend/components/charts.tsx`

- Added `monteCarlo?: MonteCarloDistribution | null` and `listPrice?: number` props
- Renders `<MonteCarloChart />` in the right panel when Monte Carlo data is present
- Panel title switches between "Simulation Results" and "Renewal Risk"

## `frontend/components/monte-carlo-chart.tsx` (new)

Shows the P10/P50/P90 distribution as labelled progress bars when `distribution` is non-null. Falls back to the original scenario ladder (`_ScenarioLadder`) when null.

## `frontend/components/property-map.tsx` (new)

See [03-leaflet-map.md](03-leaflet-map.md) for full details.

## `frontend/components/workbench.tsx`

- `PropertyMap` loaded via `dynamic(..., { ssr: false })`
- Added `pipelineStatus` state and `handleRefreshPipeline()` using a dedicated `useTransition`
- Passes `monteCarlo`, `listPrice` to `<Charts />`
- Renders `<PropertyMap geometry={report.mapGeometry} />`

## `frontend/app/page.tsx`

- Removed `MapPreview` import — map is now rendered inside `Workbench`

## `frontend/app/layout.tsx`

- Added `import "leaflet/dist/leaflet.css"` for Leaflet tile/marker styles
