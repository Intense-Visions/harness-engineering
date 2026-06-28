---
slug: "ship-agent-rehearsal-fixtures-and-harness-rehearse-skill"
milestone: "v5.0 — Article-Framing Docs & Personas"
order: 3
---

### Ship agent-rehearsal fixtures and harness:rehearse skill

- **Status:** planned
- **Spec:** —
- **Summary:** The article's deepest insight: Honnold rehearsed the crux moves on a rope until his body knew them, THEN soloed. The project has no analog. `examples/` (hello-world, multi-tenant-api, slack-echo-bridge, task-api) are showcase scaffolds, not failure-scenario fixtures. Ship `templates/rehearsal-fixtures/` containing deliberately-broken scaffolds across common failure modes (race condition, partial migration, edge-case data corruption, dependency cycle, layer violation, leaked secret). Build `harness:rehearse` skill that runs an agent against a chosen fixture and scores recovery. Used to (a) train agent personas before production trust, (b) regression-test the harness's own gates against known failure shapes, (c) give adopters a way to verify their gates fire before betting the climb on them. Source: Pass 7-A.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#561
