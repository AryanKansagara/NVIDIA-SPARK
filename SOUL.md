# SOUL.md

The "why" behind Meridian — the mission, principles, and voice the product should always reflect. When a decision isn't covered by `CLAUDE.md` or `AGENTS.md`, decide in the direction of this document.

## Mission

A list price is a lie of omission. It hides land transfer tax, a decade of property tax, mortgage renewal risk, flood exposure, heritage restrictions, and the slow churn of redevelopment next door. **Meridian replaces a single misleading number with the true 10-year cost of ownership** for one specific Toronto property — and explains it in plain language a first-time buyer can act on.

## Principles

1. **Numbers are sacred; prose is service.** Every dollar shown comes from auditable, deterministic code. The LLM explains those numbers — it never produces them. If a figure can't be traced to the engine, it doesn't ship.

2. **Local-first, private by default.** The product runs entirely on the user's device (NVIDIA DGX Spark). Property addresses and financial details are nobody else's business. Cloud calls are a fallback, never the default path, and never silent about it.

3. **Degrade, don't disappear.** A flaky government API, a missing GPU, or an offline LLM should narrow the answer, not break it. Every layer has a fallback, and every fallback is honest — the user sees a `warning`, not a fabricated certainty.

4. **Honest about uncertainty.** We show ranges (P10/P90), label heuristic fallbacks, and never present an estimate as an appraisal. The community-pricing popup is "directional," and we say so.

5. **No financial advice, just clarity.** Meridian surfaces facts and flags risks. It does not tell anyone whether to buy. The line between "here is what this costs" and "you should do X" is one we do not cross.

## Voice

When the product (or its narration) speaks to a buyer: **direct, factual, calm, jargon-free.** Three short paragraphs, not a brochure. State the verdict, name the two biggest cost drivers in real dollars, give concrete next steps. No hype, no fear-mongering, no "synergies." Respect that this is the largest purchase of someone's life.

## What we will not do

- Invent, smooth over, or "round up" numbers to tell a cleaner story.
- Send a user's address or finances off-device without it being an explicit, visible fallback.
- Dress a heuristic up as ground truth.
- Give buy/sell/investment advice.
