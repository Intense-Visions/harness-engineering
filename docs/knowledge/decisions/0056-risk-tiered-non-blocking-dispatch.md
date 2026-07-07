---
number: 0056
title: Risk-tiered, non-blocking parallel dispatch (announce-and-proceed)
date: 2026-07-07
status: accepted
tier: medium
source: docs/changes/standardize-parallel-execution/proposal.md
---

## Context

The harness already owned every primitive for safe parallelism — a topological
wave-grouper (`findParallelGroups`), severity-aware conflict prediction
(`predict_conflicts`), and worktree isolation — but nothing composed them into the
standard execution path, and parallelism only happened when a human typed "work in
parallel." Making parallel dispatch _automatic_ raised the question this ADR settles:
**when may the harness dispatch a parallel wave on its own, and when must it pause?**

A gate on every wave would reintroduce the friction we are removing. A gate on no wave
would dispatch work the conflict predictor flagged as risky. The right answer is
friction _in proportion to predicted risk_, keyed off the severity that
`predict_conflicts` already returns plus whether graph analysis was available.

## Decision

The firing policy is **risk-tiered and non-blocking** — "announce-and-proceed." Before
any dispatch the harness emits a `narration` (the standardized DAG summary) and then
acts; it does not halt for a yes/no on the common case. The per-wave firing decision
(`auto-dispatch` | `confirm` | `serialize`) is derived deterministically by
`classifyFiring` (`packages/core/src/parallelization/plan.ts`):

| Condition (evaluated in order)                   | Firing          |
| ------------------------------------------------ | --------------- |
| `high` conflict severity                         | `serialize`     |
| wave size `< minWaveSize` (default 3)            | `serialize`     |
| `medium` conflict severity                       | `confirm`       |
| `analysisLevel: 'file-only'` (graph unavailable) | `confirm`       |
| `none` **or** `low` severity + `graph-expanded`  | `auto-dispatch` |

- **`auto-dispatch`** — emit the wave's narration line and dispatch immediately via
  `harness-parallel-agents` with worktree-per-unit isolation. **No stop.**
- **`confirm`** — surface the wave + narration, take exactly one plain-text confirmation.
  Covers medium severity and the graph-unavailable case, where transitive conflicts are
  unknown and human judgment adds safety.
- **`serialize`** — run sequentially. Covers high-severity groups (the predictor already
  regroups these) and waves too small to justify parallelism. Announce the reason.

**Intentional extension beyond the spec's enumerated cases.** Decision 2 of the proposal
enumerated three buckets: clean → dispatch, medium/graph-unavailable → confirm, high →
serialize. It did not spell out **`low` severity with `graph-expanded` analysis**. This
ADR ratifies the deliberate extension — implemented in `classifyFiring` — that treats
`low` + `graph-expanded` the same as `none`: **`auto-dispatch`**. Rationale: with the
graph available, low-severity conflicts are the predictor's least-uncertain signal;
gating them would contradict "announce-and-proceed" and reintroduce friction where
judgment adds nothing. This was Phase-2 review suggestion **SUG-3**, deferred here for an
explicit, reviewable record rather than being buried in code. `file-only` low-severity
still requires `confirm` (the uncertainty is the missing graph, not the severity).

**Cross-bucket cap (P2-IMP-1).** A wave that would otherwise `auto-dispatch` but whose
direct upstream runs in the `serialized`/`cyclic` channel (a task that is _not_ a
parallel-safe wave) is **capped to `confirm`** — never weakened, and never forced all the
way to `serialize`. A prerequisite dispatched through a non-wave channel means a human /
execution gate stands between the two; the dependent wave must not silently auto-dispatch
across that boundary. This is why dispatch must honor the wave _ordering_ (serialized and
cyclic members first, then waves in array order) and must **not** key off the `firing`
field alone.

## Consequences

- **Autonomy where it is safe, a gate only where judgment helps.** Clean and
  low-severity graph-expanded waves proceed untouched; friction appears only for medium
  severity, missing-graph uncertainty, and cross-bucket boundaries.
- **A referable policy.** Future skills that dispatch fan-out work (`harness-code-review`
  Phase 4, `release-readiness` Phase 2) can adopt this same tier vocabulary instead of
  improvising.
- **Serial is always the safe default.** When in doubt — fewer than `minWaveSize`
  independent tasks, a declined `confirm`, or no graph and no confirmation — execution
  falls back to sequential, preserving today's behavior.
- **Determinism is load-bearing.** `classifyFiring` and `narrate` derive from sorted
  inputs, so the announced plan is reproducible and reviewable.
- **The `low` + `graph-expanded` extension is now on the record** — if a future change
  wants to gate it, this ADR is the thing it supersedes, not a silent code edit.

## See also

- ADR 0057 — `dependsOn` in the plan-task schema (the edges this policy schedules over).
- `docs/knowledge/core/parallelization-plan.md` — the `risk-tiered-dispatch` concept.
- `docs/reference/mcp-tools.md` — the `plan_parallelization` MCP tool.
- Spec: `docs/changes/standardize-parallel-execution/proposal.md` (Decision 2).
