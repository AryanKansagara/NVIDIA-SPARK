# Meridian Frontend

Initial frontend scaffold for the Meridian hackathon demo.

## Planned Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts

## Current Status

This frontend now includes:

- app scaffold
- landing/report screen
- live property intake form
- backend-driven report request flow
- local deterministic fallback if the backend request fails
- chart components
- map panel placeholder for future Leaflet or Mapbox integration

## Backend Configuration

The frontend reads the backend base URL from:

```env
NEXT_PUBLIC_API_BASE_URL=http://100.67.133.13:8000
```

`.env.local` is configured to point at the GX10 backend by default.

## Next Build Steps

1. Replace the fallback preview logic with full backend data everywhere.
2. Add a real map layer once geometry output is defined.
3. Surface backend evidence details in the UI.
4. Add loading, error, and empty states polish.
