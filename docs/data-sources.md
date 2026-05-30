# Meridian Data Sources And Assumptions

## Purpose

This document separates official-source facts from MVP assumptions so the team can stay honest during the hackathon.

## Official Or Direct Source Inputs

### Land Transfer Tax

- Ontario LTT: official provincial rules
- Toronto MLTT: official City of Toronto rules
- first-time buyer rebates:
  - Ontario: up to `$4,000`
  - Toronto: up to `$4,475`

These should be hardcoded from official public rules and validated against a public calculator.

### Property Tax

- Citywide residential tax rate used in current notes: `0.00767311`
- current assumption: assessed value proxy = `list_price * 0.60`

Important note:

- tax rate can be treated as a maintained config value
- assessed value proxy is an estimate, not an official valuation

### Heritage

- source: Toronto Heritage Register
- use case: flag Part IV, Part V, or listed status

Important note:

- heritage status is a restrictions signal, not a fixed levy

### Flood Risk

- source: TRCA floodline polygons
- MVP interpretation: if the property intersects a flood polygon, raise a risk flag and apply a carrying-cost proxy

Important note:

- this is not an insurance quote

### RentSafeTO

- source: RentSafeTO apartment building program datasets
- use case: building health proxy for eligible apartment buildings

Important note:

- does not apply to most freehold homes or many condos

### Building Permits

- sources:
  - active permits
  - cleared permits

Use case:

- permit-based repair or structural activity proxy when RentSafeTO is not applicable

### Development Applications

- source: City of Toronto development applications dataset
- use case: count applications within `500m`

Important note:

- this is a neighbourhood pressure signal, not proof of direct value increase

### Transit

- sources:
  - TTC routes and schedules
  - TTC subway data and shapefiles

Use case:

- derive proximity-based transit dividend or mobility savings signal

## MVP Assumptions

These are not official facts and must be labeled clearly in the product:

- `assessed_value_proxy = list_price * 0.60`
- flood carrying-cost adjustment such as `+$3,500/year`
- car-dependent baseline transport cost around `$12,000/year`
- development-density thresholds like `10+` applications within `500m`
- permit-history thresholds for yellow or red flags

## Mortgage Layer Assumptions

Recommended MVP assumptions:

- 10-year horizon
- two renewal events modeled as two 5-year terms
- three scenarios:
  - base: rates flat
  - bear: `+1.5%` at renewal
  - bull: `-0.5%` at renewal

Conditional signals:

- default-insured mortgage premium if down payment is under `20%`
- FHSA eligibility if buyer is first-time
- RRSP HBP eligibility if buyer is first-time

## Integrity Rules

To keep the demo credible:

- distinguish computed facts from heuristic proxies
- label assumptions in the UI
- never present proxy loadings as lender, insurer, or government quotes
- keep the LLM on explanation duty only
