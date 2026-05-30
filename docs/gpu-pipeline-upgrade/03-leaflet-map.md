# Phase 3 — Interactive Leaflet Map

## Goal

Replace the static CSS gradient map placeholder with a real interactive Leaflet map showing four geographic layers:

| Layer | Style | Source |
|-------|-------|--------|
| Property pin | Default Leaflet marker | Geocoded address lat/lon |
| Development pressure ring | Solid ember `#E16B47`, 10% fill, 500m radius | Report engine |
| TTC transit ring | Dashed moss, 400m radius | Report engine |
| Flood polygon | Blue `#3B82F6`, 30% fill | TRCA ArcGIS GeoJSON |

## New File: `frontend/components/property-map.tsx`

Loaded with `ssr: false` in `workbench.tsx` because Leaflet references `window` at import time, which crashes Next.js SSR.

```tsx
// workbench.tsx
const PropertyMap = dynamic(
  () => import("@/components/property-map").then((m) => ({ default: m.PropertyMap })),
  { ssr: false },
);
```

The component guards on `geometry` being null — when no report has been fetched yet it renders a CSS placeholder identical to the original:

```tsx
export function PropertyMap({ geometry }: { geometry: MapGeometry | null }) {
  if (!geometry) return <MapPlaceholder />;
  return (
    <MapContainer center={[geometry.propertyLat, geometry.propertyLon]} zoom={15}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[geometry.propertyLat, geometry.propertyLon]} />
      <Circle
        center={[geometry.propertyLat, geometry.propertyLon]}
        radius={geometry.devPressureRadiusM}
        color="#E16B47"
        fillOpacity={0.1}
      />
      {geometry.floodPolygonGeojson && (
        <GeoJSON data={geometry.floodPolygonGeojson} style={{ color: "#3B82F6", fillOpacity: 0.3 }} />
      )}
    </MapContainer>
  );
}
```

Leaflet's default icon images require a CSS import. Added to `frontend/app/layout.tsx`:

```tsx
import "leaflet/dist/leaflet.css";
```

## Install

```bash
cd frontend
npm install leaflet react-leaflet @types/leaflet
```

## Data Flow

```
flood.py
  └─ TRCA ArcGIS REST API (returnGeometry=true, f=geojson)
       └─ FloodEvidence.polygon_geojson: dict | None

report_service.py
  └─ MapGeometry(
       property_lat, property_lon,    ← from geocoder
       flood_polygon_geojson,         ← from FloodEvidence
       dev_pressure_radius_m = 500
     )

ReportResponse.map_geometry → api.ts mapReport() → MeridianReport.mapGeometry

workbench.tsx → <PropertyMap geometry={report.mapGeometry} />
```

## SSR Safety

Leaflet accesses `window.L` and the DOM at import time. The `dynamic(..., { ssr: false })` wrapper defers the entire module to the browser bundle. The placeholder renders during SSR so the page layout doesn't shift.
