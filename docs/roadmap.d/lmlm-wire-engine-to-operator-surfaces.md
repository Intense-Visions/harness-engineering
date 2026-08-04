---
slug: "lmlm-wire-engine-to-operator-surfaces"
milestone: "Intake"
order: 1
---

### LMLM Phases 4–9: wire the engine to operator surfaces

- **Status:** done
- **Spec:** docs/changes/local-model-lifecycle-manager/proposal.md
- **Summary:** DELIVERED (PR #753, merged + released). Wired the previously-dormant `@harness-engineering/local-models` engine to operator surfaces across CLI, orchestrator, and dashboard — Phases 4–9: (4) `LocalModelResolver` consumes pool state, (5) discriminated `ProposalSchema` (`kind: skill|model`) + model-proposal engine/handlers/CLI, (6) background scheduler + drift reconciliation, (7) HTTP routes + WS topics + notification sinks + S1 dispatch-safe eviction, (8) read-only dashboard panel, (9) ADRs 0058–0062 + operator guide. Corrects the accidental `done` on #386 (which was flipped during a bulk archive-split after only Phase 3c). Known limitation: the autonomous swap-proposal loop is inert until the live-HF candidate parser lands — see follow-up `lmlm-live-hf-candidate-discovery`; manual `harness models`, resolver-from-pool, and drift reconciliation all work today.
- **Blockers:** —
- **Plan:** docs/changes/local-model-lifecycle-manager/plans/
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#996