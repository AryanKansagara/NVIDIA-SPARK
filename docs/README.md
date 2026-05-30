# Meridian Docs

This folder captures the current shared understanding of the Meridian hackathon project and turns the raw notes into an executable MVP plan.

## What I Understood

Meridian is a local-first agentic application for Toronto home buyers. The core promise is simple: a listing price is incomplete, so the product computes the true 10-year cost of ownership for a specific property using public Toronto datasets plus deterministic financial logic.

The product takes three required inputs:

- `address`
- `list_price`
- `buyer_profile` (`first_time`, `investor`, or `downsizer`)

The output is not just a score. It is a structured cost breakdown plus plain-English flags:

- land transfer tax
- estimated 10-year property tax
- flood risk loading
- heritage restriction signal
- RentSafeTO or permit-based building health signal
- nearby development pressure
- mortgage cost scenarios over 10 years
- transit dividend or mobility-cost offset

The updated flow you described changes the architecture in an important way:

- Agents 1 and 2 remain data intake and retrieval
- Agent 3 becomes the deterministic financial and risk engine
- Mortgage logic belongs inside Agent 3, not the final LLM
- Agent 4 should only synthesize structured outputs into an end-user report

That means the LLM should not invent numbers, mortgage assumptions, or financial logic. It should explain results produced by deterministic code.

## Documents In This Folder

- [product-brief.md](/C:/Users/aryan/Desktop/Projects/Nvidia%20hackathonb/NVIDIA-SPARK/docs/product-brief.md)
- [mvp-spec.md](/C:/Users/aryan/Desktop/Projects/Nvidia%20hackathonb/NVIDIA-SPARK/docs/mvp-spec.md)
- [architecture.md](/C:/Users/aryan/Desktop/Projects/Nvidia%20hackathonb/NVIDIA-SPARK/docs/architecture.md)
- [tech-stack.md](/C:/Users/aryan/Desktop/Projects/Nvidia%20hackathonb/NVIDIA-SPARK/docs/tech-stack.md)
- [data-sources.md](/C:/Users/aryan/Desktop/Projects/Nvidia%20hackathonb/NVIDIA-SPARK/docs/data-sources.md)

## Recommended Use

Use these docs as the baseline for:

- project kickoff and team alignment
- splitting engineering tasks
- keeping scope under control during the hackathon
- preparing the demo narrative and judging story
