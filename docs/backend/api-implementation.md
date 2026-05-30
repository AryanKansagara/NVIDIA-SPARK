# Meridian Backend API Implementation

## Overview

The current Meridian backend is a FastAPI service that implements the first vertical slice of the product:

- accept a property input payload
- geocode the address
- gather datasource evidence through service adapters
- compute deterministic ownership costs and risk signals
- return a structured JSON report

This is the first working backend contract for the MVP. It is intentionally split so the deterministic engine and API shape are stable even while some datasource adapters are still placeholder implementations.

## What Was Implemented

### FastAPI service

The backend now runs as a standalone FastAPI app from `backend/app/main.py`.

It currently exposes:

- `GET /api/v1/health`
- `POST /api/v1/report`
- `GET /api/v1/debug/geocode?address=...`
- `GET /api/v1/debug/heritage?address=...`
- `GET /api/v1/debug/flood?address=...`
- `GET /api/v1/debug/development?address=...`

Swagger and ReDoc are also available through FastAPI:

- `/docs`
- `/redoc`

### Internal structure

The backend was organized into these layers:

- `api/` for route handlers
- `schemas/` for request and response models
- `services/geocoding/` for address resolution
- `services/data_sources/` for datasource adapters
- `services/engine/` for deterministic report computation
- `core/` for configuration

This matches the intended Meridian architecture:

- API layer handles HTTP contracts
- services collect and normalize evidence
- deterministic engine owns the actual numbers

## Endpoints

### `GET /api/v1/health`

Simple health check endpoint.

Example response:

```json
{
  "status": "ok"
}
```

### `POST /api/v1/report`

Primary report endpoint.

Expected request body:

```json
{
  "address": "401 Richmond St W, Toronto",
  "list_price": 850000,
  "buyer_profile": "first_time",
  "down_payment_percent": 10,
  "mortgage_rate": 4.79,
  "amortization_years": 25
}
```

Implemented behavior:

1. geocode address
2. look up heritage evidence
3. look up flood evidence
4. look up development-pressure evidence
5. run deterministic cost engine
6. return normalized property info, report outputs, warnings, and evidence summary

Response includes:

- resolved property info
- `true_10_year_cost`
- `cost_breakdown`
- `mortgage_scenarios`
- `flags`
- `warnings`
- `evidence_summary`
- `key_numbers`
- `summary_text`

Important note:

- `summary_text` is currently `null`
- the local LLM summary layer has not been added yet

### Debug endpoints

These are narrow inspection endpoints for integration and testing.

#### `GET /api/v1/debug/geocode`

Returns:

- normalized address
- latitude
- longitude
- geocoder source
- raw display name

#### `GET /api/v1/debug/heritage`

Returns:

- normalized address
- coordinates
- current heritage status signal
- reason
- source

#### `GET /api/v1/debug/flood`

Returns:

- normalized address
- coordinates
- flood-zone boolean
- annual risk loading
- source

#### `GET /api/v1/debug/development`

Returns:

- normalized address
- coordinates
- nearby application count within the current preview logic
- intensity bucket
- source

## Deterministic Cost Engine

The most important implementation detail is that the backend already computes the numbers deterministically.

The engine currently handles:

- Ontario land transfer tax
- Toronto municipal land transfer tax
- first-time buyer rebate logic
- 10-year property tax projection
- insured mortgage premium
- 10-year mortgage cost scenarios:
  - bull
  - base
  - bear
- transit dividend placeholder logic
- risk adjustment layer driven by evidence inputs

The backend also generates:

- structured cost breakdown
- scenario outputs
- red/yellow/green style flags
- key summary numbers

## Geocoding

Real geocoding is included in the current backend slice.

Current behavior:

- the backend uses an HTTP geocoding service
- request bias is set toward Toronto, Ontario, Canada
- the result is normalized into the internal property object

This satisfies the “real geocoder now” decision from the implementation plan.

## Datasource Adapters: Current State

The backend includes service adapters for:

- heritage
- flood
- development applications

However, the current implementations are still preview heuristics, not full live Toronto/TRCA integrations.

That means:

- geocoding is real
- deterministic engine is real
- public API contract is real
- heritage, flood, and development evidence are currently adapter placeholders

The backend surfaces this honestly through the `warnings` field in the report response.

## Current Limitations

The following pieces are not fully implemented yet:

- live Toronto Heritage Register integration
- live TRCA flood query integration
- live development applications dataset query
- RentSafeTO integration
- permit-history fallback logic
- TTC transit layer
- LLM summary generation on GX10
- ward resolution

So the backend is already structurally correct, but not yet fully connected to production-quality datasource evidence.

## Why This Implementation Matters

This backend is the correct next step because it establishes the product contract first:

- one main report endpoint
- deterministic engine as the source of truth
- service boundaries for each datasource
- debug endpoints for targeted validation

That gives the team a stable base for the next iteration:

1. replace heuristic datasource services with real live data integrations
2. connect the frontend form to `POST /api/v1/report`
3. add the local LLM summary only after the deterministic outputs are stable

## Next Recommended Backend Work

In order:

1. wire live Toronto Heritage Register lookup
2. wire live TRCA flood query
3. wire live development applications lookup
4. add partial-failure handling around datasource timeouts
5. add RentSafeTO and permits
6. connect frontend to this report endpoint
7. add local LLM summary generation
