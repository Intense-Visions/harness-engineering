---
slug: "lmlm-live-hf-candidate-discovery"
milestone: "Intake"
order: 2
---

### LMLM: live-HF candidate discovery (make the autonomous loop live)

- **Status:** planned
- **Spec:** —
- **Summary:** Surfaced by the LMLM Phases 4–9 wiring PR. The background scheduler, drift reconciliation, proposal engine, routes/WS/sinks, and dashboard are all wired end-to-end, but the orchestrator seeds `createNativeRecommender` with an **empty candidate set** because the Phase-2 live-HuggingFace→`RankerCandidate` parser was never built. Consequence: the autonomous swap-proposal loop emits **nothing in production** (manual `harness models`, resolver-from-pool, and drift reconciliation all work today). Build the HF model-list → `RankerCandidate[]` parser (repo → sizeB/activeB/quant enumeration) and seed the recommender so `GET /recommendations` and the scheduler produce real proposals. Ref ADR 0059 (candidate-discovery deferral note). This is the single item that turns LMLM autonomy from wired-but-inert to live.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** —
