# Skill Advisor — roadmap-fleet

Signals extracted from the spec: autonomous orchestration, batch fan-out, per-item pipeline, candidate scoring, worktree isolation, artifact verification, skill authoring.

## Apply

- **harness-roadmap-pilot** — reuse its impact-scoring to select and order the batch (Decision 2).
- **harness-autopilot** — the per-item execution pipeline each sub-agent runs autonomously.
- **harness-brainstorming** — the per-item spec stage that precedes autopilot for non-bugfix candidates.
- **harness-parallel-coordinator** — prior art for dispatching independent work across isolated agents; informs the DISPATCH phase.
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, Rationalizations to Reject).

## Reference

- **harness-audit** — precedent for fan-out parallel agents plus dedup plus publish; a sibling fleet-shaped pattern.
- **harness-code-review** — the per-item quality gate inside autopilot; the safeguard the fleet must not skip.
- **pr-fleet** — the downstream family member that lands the batch roadmap-fleet produces.

## Consider

- **The Workflow primitive** — a future deterministic/resumable execution substrate for the DISPATCH phase (named as an upgrade, not v1).
