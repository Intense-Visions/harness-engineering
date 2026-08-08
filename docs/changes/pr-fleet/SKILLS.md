# Skill Advisor — pr-fleet

Signals extracted from the spec: autonomous orchestration, PR-queue triage, review-assist, batch fan-out, worktree isolation, artifact + all-OS-CI verification, human merge gate, land automation, skill authoring.

## Apply

- **harness-code-review** — the real per-PR review pipeline each assist subagent runs; the quality gate pr-fleet composes and never reimplements.
- **harness-roadmap-pilot** — reuse its impact-scoring to order landable PRs by land-priority (Decision 2/SELECT).
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, Rationalizations to Reject).
- **harness-parallel-coordinator** — prior art for dispatching independent work across isolated agents; informs the DISPATCH fan-out.

## Reference

- **roadmap-fleet** — the structural twin (build stage); pr-fleet is its downstream land-stage sibling and shares the extracted spine.
- **harness-audit** — precedent for fan-out parallel agents plus dedup plus report.
- **harness-pre-merge-brief** — the senior-facing pre-merge accountability brief; complementary human-facing surface at the merge boundary.

## Consider

- **The Workflow primitive** — a future deterministic/resumable execution substrate for the DISPATCH phase (named as an upgrade per ADR 0087, not v1).
- **harness-rollback** — the post-ship circuit breaker; the safety net downstream of a landed batch.
