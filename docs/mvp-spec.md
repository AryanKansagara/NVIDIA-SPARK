# Meridian MVP Spec

## MVP Goal

Deliver a working local demo that takes one Toronto property input and returns a believable, explainable 10-year ownership report within a few seconds.

## MVP Inputs

- `address`
- `list_price`
- `buyer_profile`

Recommended MVP optional inputs:

- `down_payment_percent`
- `mortgage_rate`
- `amortization_years`

If optional inputs are omitted, the app should use visible defaults.

## MVP Output

The MVP should return:

- `true_10_year_cost`
- `cost_breakdown`
- `risk_flags`
- `mortgage_scenarios`
- `transit_dividend`
- `buyer_program_signals`
- `plain_english_summary`

## Must-Have Scope

### 1. Intake

- accept address, list price, buyer profile
- geocode into lat/lon
- normalize address string for dataset matching

### 2. Deterministic Cost Engine

- Ontario land transfer tax
- Toronto municipal land transfer tax
- first-time buyer rebate logic
- property tax estimate using current citywide rate
- 10-year property tax projection

### 3. Mortgage Layer

This belongs in Agent 3.

Include:

- insured-mortgage premium signal when down payment is under 20%
- 10-year mortgage projection with at least 3 scenarios:
  - base
  - bear
  - bull
- renewal-risk modeling for two 5-year terms
- FHSA and RRSP HBP eligibility signals for first-time buyers

For MVP, keep assumable mortgage and prepayment-penalty logic as surfaced notes unless exact inputs are available.

### 4. Property Risk Checks

- heritage register lookup
- flood-zone intersection
- RentSafeTO score when applicable
- permit fallback when RentSafeTO does not apply
- development applications within 500m

### 5. Synthesis

- final structured JSON from deterministic engine
- LLM turns JSON into buyer-friendly narrative
- no freeform number generation by the LLM

## Should-Have Scope

- TTC proximity based transit dividend
- subway-station distance banding
- stronger permit-history heuristics
- confidence score per module

## Explicitly Out Of Scope

- MLS ingestion
- real insurance quotes
- actual MPAC reassessment prediction
- vector database or RAG
- model fine-tuning
- auth or multi-user platform work

## Suggested Demo Cases

- heritage-heavy downtown property near transit
- lower-density suburban property with weak transit value
- newer transit-oriented property with fewer structural concerns

## Success Criteria

The MVP is good enough if:

- the numbers are internally consistent
- the sources are explainable
- the flags feel plausible to a Toronto buyer
- the report is easy to understand in under 30 seconds
- the team can demo at least 3 addresses without manual intervention
