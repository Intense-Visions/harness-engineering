---
slug: "adaptive-model-routing"
milestone: "Intake"
order: 5
---

### Adaptive Model Routing (AMR)

- **Status:** in-progress
- **Spec:** docs/changes/adaptive-model-routing/proposal.md
- **Summary:** Difficulty- and cost-aware, provider-neutral routing layered on the shipped `BackendRouter` (Spec B `granular-task-routing` / Spec 2 `multi-backend-routing`). A per-invocation complexity triage picks the cheapest capable backend (local _or_ cloud) per capability tier; split-routes workflow stages; escalates tiers on repeated quality failures (D10); gates Meridian autonomy for straightforward roadmap items. Opt-in and default-off — adopters who ignore it get byte-identical behavior (D11). 11 decisions, 19 success criteria, 6 phases (~21d): Phases 1–4 substrate-only and independently shippable; Phases 5–6 add tenant policy via the Shuttle `RuntimeAdapter` + autonomy graduation. Consumes the LMLM pool. Extends the Multi-client portability strategy track; direct lever on the Agent Autonomy metric.
- **Blockers:** —
- **Plan:** —
- **Assignee:** Chad Warner
- **Priority:** P1
- **External-ID:** —
