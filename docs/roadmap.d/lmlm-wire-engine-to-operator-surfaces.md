---
slug: "lmlm-wire-engine-to-operator-surfaces"
milestone: "Intake"
order: 1
---

### LMLM Phases 4–9: wire the engine to operator surfaces

- **Status:** planned
- **Spec:** docs/changes/local-model-lifecycle-manager/proposal.md
- **Summary:** The `@harness-engineering/local-models` package (v0.2.2, published) implements the LMLM engine — hardware detection, benchmark-ranked recommendation, Ollama install adapter, pool manager + eviction — but has ZERO consumers: no package imports it, the `localModels` config block is inert (type-only, read by no runtime code), and the only shipped CLI is `harness models probe` (which uses the orchestrator's `/v1/models` probe, not the package). Roadmap #386 was marked `done` after Phase 3c (last feature commit `feat(local-models): LMLM Phase 3c`; `done` applied during a bulk roadmap archive-split, not a completion). Phases 4–9 never landed: (4) `LocalModelResolver` consuming pool state [D5], (5) `ProposalSchema` generalization `proposalKind: skill|model` [D11], (6) background scheduler + drift reconciliation [D9/D12], (7) HTTP/WS/notification sinks [D6], (8) dashboard panel, (9) docs/ADRs. The `harness models` command header itself lists these as "future LMLM phases." Spec predates codebase drift (a `LocalModelResolver` now exists via #296/#297 but only probes `/v1/models`), so revalidate the spec (soundness-review) before building. Corrects the accidental `done` on #386.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** —
