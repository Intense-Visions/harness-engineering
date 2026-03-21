# Performance Pipeline Unification

**Date:** 2026-03-21
**Status:** Proposed
**Parent:** [Harness v2 Design Patterns](../harness-v2-patterns/proposal.md) — Pattern 1
**Scope:** Tighten gaps in existing performance workflow; no new orchestrator
**Keywords:** performance, baselines, hotspot, graph-fallback, tier-thresholds, benchmark, persona-sequencing, perf-tdd

## Overview

Tighten the gaps in the existing performance workflow without adding a new orchestrator. Update `harness-perf` (graph fallback, baseline lock-in), `harness-perf-tdd` (tier threshold integration), and the performance-guardian persona (explicit sequencing, missing benchmark detection).

### Non-goals

- New orchestrator skill — the two skills have clean separation that should be preserved
- Cross-module benchmark impact analysis — future enhancement
- Benchmark variance/flakiness handling — runtime infrastructure concern
- Size budget implementation — separate feature

## Decisions

| Decision                    | Choice                                                                            | Rationale                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Unification approach        | Light — enhance existing skills and persona                                       | Skills have clean cognitive mode separation (verifier vs implementer); no need to muddy it |
| Scope                       | 4 gaps: persona sequencing, graph fallback, baseline management, tier integration | Most impactful gaps; others are feature additions, not unification                         |
| Missing benchmark detection | Persona detects and flags, suggests perf-tdd                                      | Enforcement agent shouldn't run development workflows, but should detect the gap           |
| Baseline lock-in            | Require baseline update in PRs that touch `.bench.ts`                             | Simplest; keeps baselines reviewable in version control                                    |
| Skill structure             | No new skills or orchestrators                                                    | Each change is independent and testable                                                    |

## Technical Design

### 1. Performance-Guardian Persona: Explicit Sequencing

Update `performance-guardian.yaml` with ordered steps:

```yaml
steps:
  - command: validate
    when: always
  - command: check-deps
    when: always
  - command: check-perf --structural
    when: always
  - command: check-perf --coupling
    when: always
  - skill: harness-perf
    phases: [BENCHMARK, REPORT, ENFORCE]
    when: on_pr
  - check: missing-benchmarks
    when: on_pr
```

**Missing benchmark detection:**

When the persona runs on a PR, it checks:

1. Identify new/modified source files in the diff
2. For each, check if a co-located `.bench.ts` file exists
3. If the file is in a `@perf-critical` path (via `get_critical_paths`) and has no benchmark: flag as Tier 2 warning
4. If the file is not critical but is new: flag as Tier 3 info suggesting perf-tdd
5. Output: "New file `src/core/parser.ts` is on a critical path but has no benchmark. Consider using `harness-perf-tdd` to add one."

### 2. harness-perf: Graph Fallback for Hotspot Scoring

Add graph availability section per the [Graph Fallback spec](../graph-fallback-implementation/proposal.md):

**Staleness sensitivity:** Medium — auto-refresh if >10 commits stale (hotspot scoring uses churn data which doesn't change rapidly)

**Fallback strategies:**

| Feature                              | With Graph                                                   | Without Graph                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Hotspot scoring (churn x complexity) | `GraphComplexityAdapter` computes from graph nodes           | `git log --format="%H" -- <file>` for per-file commit count; complexity from `check-perf --structural` output; multiply manually |
| Coupling ratio                       | `GraphCouplingAdapter` computes from graph edges             | Parse import statements, count fan-out/fan-in per file                                                                           |
| Critical path resolution             | Graph inference (high fan-in) + `@perf-critical` annotations | `@perf-critical` annotations only; grep for decorator/comment                                                                    |
| Transitive dep depth                 | Graph BFS depth                                              | Import chain follow, 2 levels deep                                                                                               |

**Notice:** "Running without graph (run `harness scan` to enable hotspot scoring and coupling analysis)"

**Impact on tiers:** Without graph, Tier 1 hotspot detection is degraded. Hotspot scoring falls back to churn-only (no complexity multiplication). This is documented in output.

### 3. harness-perf: Baseline Lock-In Check

Add to Phase 2 (BENCHMARK) or as a pre-check:

```
Before running benchmarks, check:
1. List all .bench.ts files changed in this PR (git diff --name-only | grep '.bench.ts')
2. If any .bench.ts files are new or modified:
   a. Check if .harness/perf/baselines.json is also modified in this PR
   b. If NOT modified: flag as Tier 2 warning
      "Benchmark files changed but baselines not updated.
       Run `harness perf baselines update` and commit the result."
   c. If modified: verify the updated baselines include entries for all changed benchmarks
3. If no .bench.ts files changed: skip this check
```

This check runs in the persona (on PR) and in `harness-perf` standalone when invoked with `--check-baselines`.

**New flag:**

| Flag                | Effect                                                 |
| ------------------- | ------------------------------------------------------ |
| `--check-baselines` | Verify baseline file is updated when benchmarks change |

### 4. harness-perf-tdd: Tier Threshold Fallback

Update Phase 2 (GREEN) to reference tier thresholds when the spec doesn't define performance requirements:

```
When the spec defines a performance requirement (e.g., "< 50ms"):
  → Use the spec requirement as the benchmark assertion threshold

When the spec is vague or silent on performance:
  → Fall back to harness-perf tier thresholds:
    - Critical path functions: must not regress >5% from baseline (Tier 1)
    - Non-critical functions: must not regress >10% from baseline (Tier 2)
    - Structural complexity: must stay under Tier 2 thresholds
      (cyclomatic ≤15, nesting ≤4, function length ≤50, params ≤5)

When no baseline exists (new code):
  → GREEN phase captures the initial baseline
  → VALIDATE phase ensures the captured baseline is committed
  → No regression comparison on first run
```

This gives developers concrete targets even when the spec doesn't specify performance requirements.

## Success Criteria

1. **Persona has explicit ordering** — performance-guardian steps execute in defined sequence, not as an unordered capability list
2. **Missing benchmarks detected** — new files on critical paths without `.bench.ts` are flagged as Tier 2 warnings on PRs
3. **Hotspot scoring works without graph** — falls back to churn-only scoring via git log; documents the limitation in output
4. **Graph staleness checked** — auto-refresh if >10 commits stale before hotspot scoring
5. **Baseline lock-in enforced** — PRs that change `.bench.ts` files without updating baselines are flagged as Tier 2 warnings
6. **Tier thresholds guide development** — perf-tdd GREEN phase uses tier thresholds when spec is silent on performance requirements
7. **New code baselines captured** — perf-tdd GREEN phase captures initial baseline; VALIDATE ensures it's committed
8. **No new skills or orchestrators** — all changes are updates to existing skills and persona
9. **Standalone skill behavior preserved** — harness-perf and harness-perf-tdd work independently exactly as today, with enhancements additive

## Implementation Order

1. **Performance-guardian persona sequencing** — Update `performance-guardian.yaml` with explicit ordered steps. Add missing benchmark detection logic.

2. **harness-perf graph fallback** — Add graph availability section to SKILL.md with medium staleness sensitivity. Implement churn-only hotspot fallback and import-based coupling fallback.

3. **harness-perf baseline lock-in** — Add baseline validation check to Phase 2. Add `--check-baselines` flag. Wire into persona's PR check.

4. **harness-perf-tdd tier integration** — Update Phase 2 (GREEN) with tier threshold fallback when spec is silent. Add baseline capture guidance for new code.
