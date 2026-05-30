# Meridian Architecture

## System Shape

Meridian should be built as a mostly deterministic pipeline with one synthesis layer at the end.

## Agent Breakdown

### Agent 1: Intake

Responsibility:

- validate user input
- geocode address
- produce normalized property object

Input:

- address
- list price
- buyer profile
- optional mortgage assumptions

Output:

```json
{
  "address": "401 Richmond St W, Toronto",
  "normalized_address": "401 RICHMOND ST W",
  "list_price": 850000,
  "buyer_profile": "first_time",
  "lat": 43.647,
  "lon": -79.395,
  "ward": "TBD"
}
```

### Agent 2: Data Retrieval

Responsibility:

- fetch open datasets or cached local copies
- run spatial and address lookups
- return raw evidence objects

Preferred implementation:

- async Python with `httpx`
- cached shapefiles and CSVs loaded once at startup

Output examples:

- heritage match object
- RentSafeTO record
- flood intersection result
- nearby development count
- active/cleared permit summaries
- transit proximity features

### Agent 3: Deterministic Cost And Risk Engine

Responsibility:

- compute every number that matters
- convert raw evidence into flags
- generate scenario outputs

This is where the newer mortgage layer belongs.

Agent 3 should include:

- tax calculations
- rebate logic
- property tax projection
- mortgage insurance premium logic
- mortgage renewal scenarios
- flood loading
- risk-weighted adjustments
- transit dividend
- buyer-program benefit signals

Output should be strict JSON, for example:

```json
{
  "true_10_year_cost": 1247000,
  "components": {
    "ltt_total": 28850,
    "property_tax_10y": 39200,
    "mortgage_cost_base": 1150000,
    "risk_adjustments": 29000,
    "transit_dividend": -87000
  },
  "flags": [
    {
      "severity": "red",
      "title": "Heritage Part IV Designated"
    }
  ],
  "mortgage_scenarios": {
    "base": {},
    "bear": {},
    "bull": {}
  }
}
```

### Agent 4: LLM Synthesis

Responsibility:

- explain the structured output
- rank the most important issues
- produce concise buyer-facing guidance

Non-responsibility:

- inventing numeric outputs
- doing tax or mortgage calculations
- making unsupported claims about insurance or appraisal value

## Deployment Shape

```text
Next.js Frontend
      ↓
FastAPI Backend
      ↓
Deterministic Cost + Risk Engine
      ↓
Structured JSON
      ↓
GX10 Nemotron LLM API
      ↓
Buyer-friendly Summary
```

## Technical Recommendations

- Next.js + TypeScript for the frontend
- Tailwind CSS + `shadcn/ui` for rapid UI work
- Leaflet or Mapbox for property and risk visualization
- Recharts for simple breakdown charts
- Python 3.11
- FastAPI for the backend API
- `httpx` for async retrieval
- `pydantic` for structured schemas
- `geopandas`, `shapely`, and `pyproj` for spatial work
- local OpenAI-compatible LLM endpoint on the GX10

## Practical Build Order

1. Build Agent 3 schemas first so the rest of the system has a target contract.
2. Implement Agent 1 input normalization and geocoding.
3. Implement Tier 1 data retrieval modules.
4. Wire Agent 3 calculations.
5. Add Agent 4 synthesis only after deterministic outputs are stable.

## Key Architectural Decision

The main correction to preserve product integrity is this:

If Meridian claims "true cost of ownership," all financially material calculations should live in deterministic code paths. The LLM is presentation, not accounting.
