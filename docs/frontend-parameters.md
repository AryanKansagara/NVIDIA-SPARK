# Frontend Number Parameters

This document lists **every parameter used to generate the numbers shown on the
frontend** (the cost breakdown, scenarios, key numbers, flags, Monte Carlo band,
map rings, and the community-pricing popup).

The deterministic financial engine lives in two mirrored places:

- **Backend (authoritative):** `backend/app/services/engine/report_engine.py`,
  with configurable values in `backend/app/core/config.py`.
- **Frontend (offline preview):** `frontend/lib/report.ts` (`buildPreviewReport`),
  used only when the backend has not yet returned. The constants below are kept
  identical in both so the preview matches the live report.

The LLM (NVIDIA Nemotron `nvidia/nemotron-nano-12b-v2-vl`, served by a local NIM
container with a hosted-API fallback) **never invents numbers** — it only narrates
the values produced here.

---

## 1. Land Transfer Tax (LTT)

Toronto buyers pay **both** Ontario and Toronto LTT. Each is a progressive tax
over the same marginal bands:

| Portion of price | Marginal rate |
|------------------|---------------|
| up to $55,000 | 0.5% |
| $55,000 – $250,000 | 1.0% |
| $250,000 – $400,000 | 1.5% |
| $400,000 – $2,000,000 | 2.0% |
| above $2,000,000 | 2.5% |

- `land_transfer_tax_total = ontario_LTT + toronto_LTT − first_time_rebate`
- **First-time buyer rebate:** `$8,475` (applied only when `buyer_profile == "first_time"`), floored at `$0`.

## 2. Property Tax (10-year projection)

| Parameter | Value | Config key |
|-----------|-------|------------|
| Property tax rate | `0.00767311` | `property_tax_rate` |
| Assessed value factor | `0.60` (assessment ≈ 60% of list price) | `assessed_value_factor` |
| Annual growth rate | `0.03` (3%/yr) | `property_tax_growth_rate` |

```
annual_tax  = list_price × assessed_value_factor × property_tax_rate
property_tax_10y = annual_tax × ((1 + growth)^10 − 1) / growth      # 10-yr growing annuity
```

## 3. Insured Mortgage Premium (CMHC)

Charged when the down payment is under 20%; the premium is added to the borrowed
principal.

| Down payment | Premium rate (× borrowed amount) |
|--------------|----------------------------------|
| ≥ 20% | 0% |
| 15% – 20% | 2.8% |
| 10% – 15% | 3.1% |
| 5% – 10% | 4.0% |

```
borrowed          = list_price − list_price × down_payment_percent/100
insured_premium   = borrowed × premium_rate
mortgage_principal = borrowed + insured_premium
```

## 4. Mortgage Cost over 10 Years

Modeled as **two consecutive 5-year terms (60 + 60 months)** on a standard
amortizing payment, with a rate change at renewal:

- Monthly payment uses the standard amortization formula at `mortgage_rate` over `amortization_years`.
- First term: 60 monthly payments at the starting rate.
- At renewal, the remaining balance is re-amortized over `amortization_years − 5`
  at `renewal_rate = max(0.5%, start_rate + renewal_delta)`.

| Scenario | `renewal_delta` |
|----------|-----------------|
| **Bull** | −0.5% (rates fall at renewal) |
| **Base** | 0.0% (flat) |
| **Bear** | +1.5% (rates rise at renewal) |

`mortgage_cost_10y = first_term_payments(60) + second_term_payments(60)`

## 5. Risk Loadings

```
risk_adjustments =
    flood_annual_risk_loading × 10
  + 12,000   if heritage status is not "no_match_preview"
  + 17,000   if development.intensity == "high"
     7,000   if development.intensity == "medium"
         0   otherwise
```

| Parameter | Value | Config key |
|-----------|-------|------------|
| Flood annual risk loading | `3,500` /yr | `flood_risk_annual_loading` |

> Note: the standalone frontend preview (`report.ts`, used only before the backend
> responds) uses a simplified risk proxy (`$29k` downtown / `$18k` otherwise,
> `+$8k` for investors). The **live backend** uses the formula above.

## 6. Transit Dividend (cost offset)

A 10-year mobility-cost offset, subtracted from total cost. Determined by whether
the address matches downtown/transit keywords (king, queen, richmond, yonge,
front, union, osgoode, spadina, bloor, …).

| Location | Dividend | Config key |
|----------|----------|------------|
| Downtown / transit-aligned | `87,000` | `transit_dividend_downtown` |
| Default | `28,000` | `transit_dividend_default` |

## 7. True 10-Year Cost (headline number)

```
true_10_year_cost =
    down_payment
  + land_transfer_tax_total
  + property_tax_10y
  + mortgage_cost_10y_base
  + risk_adjustments
  − transit_dividend

above_list_percent = round((true_10_year_cost − list_price) / list_price × 100)
```

Bull/Base/Bear scenarios re-use the same total with the matching mortgage figure.

## 8. Monte Carlo Band (P10 / P50 / P90)

GPU-accelerated simulation (CuPy on the GB10, NumPy fallback) over
`monte_carlo_n_sims = 10,000` trajectories. Each trajectory perturbs:

- property-tax growth around `property_tax_growth_rate` (3%),
- flood-event probability (raised when `flood.in_flood_zone`),
- development-density pressure (`dev_density_score = min(applications_500m / 20, 1.0)`).

Outputs `p10`, `p50`, `p90`, `mean`, shown as the cost-range band.

## 9. Map Geometry

| Element | Value / source |
|---------|----------------|
| Property pin | geocoded lat/lon (Nominatim) |
| Development pressure radius | `500 m` (`dev_pressure_radius_m`) |
| TTC walkability ring | `400 m` (frontend constant) |
| Flood polygon | TRCA ArcGIS Floodline intersection |

## 10. Community-Pricing Popup (the orange "$" pin)

Deterministic directional estimate (not an appraisal) computed in
`report_service._community_insights`, anchored to the subject list price and
adjusted by the location signals already gathered:

| Output | Formula |
|--------|---------|
| Median estimate | `list_price × 1.04` if downtown (high transit dividend) else `× 0.97` |
| Typical range | median `× (1 ± spread)`, `spread = 0.10 / 0.14 / 0.18` for dev intensity low / medium / high |
| Price per sq ft | `$1,150` downtown / `$720` suburban, `× 1.05` if dev intensity is high |
| Trend | `rising` (high) / `stable` (medium) / `cooling` (low) dev intensity |

Notes are appended for transit premium, redevelopment churn (with the live
`applications_500m` count), and a 3–8% discount note when in a flood zone.

---

### LLM / NIM configuration (numbers narration)

| Parameter | Value | Config key |
|-----------|-------|------------|
| Model | `nvidia/nemotron-nano-12b-v2-vl` | `nim_model` / `nemotron_model` |
| Local NIM (default/primary) | `http://localhost:8080/v1` | `nim_local_url` |
| Hosted API (backup) | `https://integrate.api.nvidia.com/v1` | `nim_base_url` |
| API key (backup only) | `NIM_API_KEY` env | `nim_api_key` |

The synthesis service tries the **local NIM container first** and falls back to the
hosted NVIDIA API using `NIM_API_KEY` if the container is unreachable. See
`backend/app/services/synthesis/service.py`.
