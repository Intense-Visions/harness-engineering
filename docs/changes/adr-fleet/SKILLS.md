# Skill Advisor — adr-fleet

Signals extracted from the spec: autonomous orchestration, pending-decision backlog, ADR drafting, architecture-advisor fan-out, worktree isolation, artifact + all-OS-CI verification, human batch sign-off, never-auto-accept, skill authoring.

## Apply

- **harness-architecture-advisor** — the real per-item decide pipeline each subagent runs to draft one ADR; the flow adr-fleet composes and never reimplements.
- **harness-roadmap-pilot** — reuse its impact-scoring to order pending decisions by impact (SELECT).
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, Rationalizations to Reject).
- **harness-parallel-coordinator** — prior art for dispatching independent work across isolated agents; informs the DISPATCH fan-out.

## Reference

- **pr-fleet** — the land-stage sibling whose human-merge-gate (ADR 0089) is the structural precedent for adr-fleet's decide-stage sign-off gate.
- **roadmap-fleet** — the build-stage sibling; adr-fleet is its upstream decide-stage neighbor and shares the documented spine.
- **harness-audit** — precedent for fan-out parallel agents plus dedup plus report.

## Consider

- **The Workflow primitive** — a future deterministic/resumable execution substrate for the DISPATCH phase (named as an upgrade per ADR 0087, not v1).
- **harness-knowledge-pipeline** — ingests accepted ADRs into the knowledge graph as decision nodes; the downstream consumer of a signed-off batch.
