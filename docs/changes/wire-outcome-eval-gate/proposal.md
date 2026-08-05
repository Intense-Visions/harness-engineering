# Wire outcome-eval into the lifecycle as an automatic spec-satisfaction gate

## Overview

`outcome-eval` is the harness's first blocking post-execution spec-satisfaction
gate: it reads a spec's acceptance section, the change diff, and test output and
emits a confidence-rated `OutcomeVerdict` (`SATISFIED | NOT_SATISFIED |
INCONCLUSIVE`) whose ship `authority` is DERIVED in TypeScript from
`(verdict, confidence)` — a high-confidence `NOT_SATISFIED` is `blocking`, every
other verdict is `advisory`. Until now nothing invoked it automatically: it was
absent from `.husky/`, from `.github/workflows/`, and from the harness-autopilot
loop. Its blocking authority only bit when a human or agent chose to run it.

This change wires it in at the two lifecycle points where "did the
implementation satisfy its spec?" must be answered automatically:

- **the harness-autopilot ship boundary** (skill instruction), and
- **pre-merge CI** (a headless CLI entrypoint invoked from the required-review
  workflow, whose persisted verdict the pre-merge brief consumes).

## User-Visible Behavior

- A new `harness outcome-eval-ci` command runs the gate headlessly: it resolves
  the spec (explicit `--spec` or auto-discovered from the diff), the diff range,
  and optional captured test output; runs the `OutcomeEvaluator`; persists the
  `execution_outcome` node to `.harness/graph`; and exits non-zero ONLY when
  `--block-on blocking` (the default) and the TS-derived `authority` is
  `blocking` (a high-confidence `NOT_SATISFIED`). Every other verdict exits 0.
- The command is degrade-safe: no spec in the diff, no analysis provider, an
  empty diff, or a persistence failure yields an `INCONCLUSIVE`/advisory verdict
  and exit 0 — it never throws and never blocks on infrastructure noise.
- `harness-autopilot` gains an `OUTCOME_EVAL` state between `FINAL_REVIEW` and
  `DONE`. It gathers the full `startingCommit..HEAD` diff plus test output,
  invokes the `outcome_eval` MCP tool, and HALTS before `DONE` on a blocking
  verdict (offering fix / override / stop); an advisory verdict proceeds. The
  verdict persists as an `execution_outcome` node.
- The persisted `execution_outcome` node now carries the FULL verdict
  (`rationale`, `authority`, `unmetCriteria`) plus an optional `commit` sha, so a
  sha-keyed consumer (the pre-merge brief) can reconstruct and surface the
  verdict without re-running the judge.
- The `required-review` dogfood workflow runs `outcome-eval-ci` (non-blocking
  during bake-in) before the pre-merge-brief step, so the brief surfaces the
  outcome-eval result.

## Success Criteria

1. `harness outcome-eval-ci` exists and is registered in the CLI command
   registry.
2. The gate honors the TS-derived authority: a high-confidence `NOT_SATISFIED`
   (`authority: "blocking"`) with `--block-on blocking` exits 1; every other
   verdict, and any `--block-on none` invocation, exits 0. Authority is read off
   the verdict, never recomputed from the LLM.
3. The gate is degrade-safe: no resolvable spec, a thrown evaluator, or a graph
   persistence failure resolves to an advisory verdict and exit 0 (never blocks
   on infrastructure noise).
4. The persisted `execution_outcome` node includes `rationale`, `authority`,
   `unmetCriteria`, and — when supplied — `commit`, additively (a node written
   without a commit is byte-identical to the prior shape aside from the new
   verdict fields).
5. `harness-autopilot` documents an `OUTCOME_EVAL` gate at the ship boundary
   that halts on a blocking verdict and honors the TS-derived authority, kept in
   parity across all platform skill copies.
6. `required-review.yml` invokes `outcome-eval-ci` before the pre-merge-brief
   step, keyed to the same head sha the brief looks up.
7. Tests cover the gate firing and honoring the verdict authority (blocking →
   exit 1; advisory / `--block-on none` → exit 0), the degradation paths, and
   the enriched persistence.
8. No new `harness validate` findings; layer rules and lint pass; no internal
   roadmap/PR/issue references leak into shipped skill text.

## Implementation Order

### Phase 1: Persistence + CLI gate + wiring

<!-- complexity: medium -->

Enrich the `OutcomeEvaluator` persistence (full verdict + optional `commit`),
thread `commit` through the `outcome_eval` MCP tool, add the `outcome-eval-ci`
command and register it, wire the autopilot `OUTCOME_EVAL` state, and add the
`required-review.yml` step. Cover with unit tests.

## References

- Closes github:Intense-Visions/harness-engineering#662
- Upstream twin: `acceptance-eval` (pre-execution spec-measurability gate).
- Consumer unblocked: the pre-merge brief (surfaces the outcome-eval result).
