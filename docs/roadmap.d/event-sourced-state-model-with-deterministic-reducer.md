---
slug: "event-sourced-state-model-with-deterministic-reducer"
milestone: "Parallel Execution & State"
order: 1
---

### Event-Sourced State Model with Deterministic Reducer

- **Status:** done
- **Spec:** docs/changes/event-sourced-state-model/proposal.md
- **Summary:** Replace harness's mutated .harness/state.json with an append-only event log + pure deterministic reducer + materialized snapshot, plus an explicit guarded state machine for autopilot/orchestrator task lanes (forced-transition rules, dependency guards, mandatory evidence to reach terminal states). Highest-leverage hardening of harness's weakest subsystem (state/provenance); subsumes and complements the Append-Only Session Audit Trail (#580). Modeled on Spec Kitty's status/{emit,store,reducer,transitions}.py. Adoption #1 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#598
