# Plan: Advanced Review Pipeline

**Issue:** advanced-review-pipe-c2940ed8 ([ACE-Batch6])
**Proposal:** `docs/changes/advanced-review-pipeline/proposal.md`
**Date:** 2026-04-16

## Task Breakdown

| #   | Task                                                                                                                 | Files                                                                                    | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| 1   | Implement `findParallelGroups()` — Kahn-style BFS with cycle/orphan handling                                         | `packages/core/src/review/parallel-groups.ts` + test                                     | —          |
| 2   | Add `GraphNode`, `ParallelGroups` types and re-export                                                                | `packages/core/src/review/types/parallel-groups.ts`, `types/index.ts`, `review/index.ts` | 1          |
| 3   | Implement meta-judge rubric heuristic generator                                                                      | `packages/core/src/review/meta-judge.ts` + test                                          | —          |
| 4   | Add `Rubric`, `RubricItem` types and extend `ContextBundle` / `PipelineFlags`                                        | `review/types/meta-judge.ts`, extend `types/context.ts`, `types/pipeline.ts`             | 3          |
| 5   | Wire `--thorough` flag to call `generateRubric()` in `runReviewPipeline()` between Phases 2 and 3, attach to bundles | `review/pipeline-orchestrator.ts`                                                        | 4          |
| 6   | Implement two-stage isolation helper `splitBundlesByStage()`                                                         | `packages/core/src/review/two-stage.ts` + test                                           | 4          |
| 7   | Wire `--isolated` flag to run Phase 4 twice in `runReviewPipeline()`                                                 | `review/pipeline-orchestrator.ts`                                                        | 6          |
| 8   | Implement MCP tier assignments and estimator                                                                         | `packages/cli/src/mcp/tool-tiers.ts` + test                                              | —          |
| 9   | Wire `selectTier()` into `harness mcp` command / `startServer()`                                                     | `packages/cli/src/commands/mcp.ts`, `mcp/server.ts`                                      | 8          |
| 10  | Implement triage router module and default rules                                                                     | `packages/orchestrator/src/core/triage-router.ts` + test                                 | —          |
| 11  | Add `--thorough`, `--isolated` flags to `createReviewCommand()` and thread through `runAgentReview()`                | `packages/cli/src/commands/agent/review.ts`                                              | 5, 7       |
| 12  | Add `--tier` and `--budget-tokens` flags to `harness mcp`                                                            | `packages/cli/src/commands/mcp.ts`                                                       | 9          |
| 13  | `harness validate` + unit tests clean                                                                                | —                                                                                        | all        |

## Files Touched Summary

Additions:

- `packages/core/src/review/parallel-groups.ts`
- `packages/core/src/review/meta-judge.ts`
- `packages/core/src/review/two-stage.ts`
- `packages/core/src/review/types/meta-judge.ts`
- `packages/core/src/review/types/parallel-groups.ts`
- `packages/cli/src/mcp/tool-tiers.ts`
- `packages/orchestrator/src/core/triage-router.ts`
- `packages/core/tests/review/parallel-groups.test.ts`
- `packages/core/tests/review/meta-judge.test.ts`
- `packages/core/tests/review/two-stage.test.ts`
- `packages/cli/tests/mcp/tool-tiers.test.ts` (new dir if absent)
- `packages/orchestrator/tests/core/triage-router.test.ts`

Modifications:

- `packages/core/src/review/types/context.ts` (+`rubric?`, +`stage?`)
- `packages/core/src/review/types/pipeline.ts` (+`thorough?`, +`isolated?`)
- `packages/core/src/review/types/fan-out.ts` (+`rubricItemId?`)
- `packages/core/src/review/types/index.ts` (barrel exports)
- `packages/core/src/review/index.ts` (public exports)
- `packages/core/src/review/pipeline-orchestrator.ts` (rubric + isolation wiring)
- `packages/cli/src/mcp/server.ts` (optional: expose `getToolDefinitions()` already exists)
- `packages/cli/src/commands/mcp.ts` (add `--tier`, `--budget-tokens`)
- `packages/cli/src/commands/agent/review.ts` (add `--thorough`, `--isolated`)

## Architectural Constraints

All additions respect `harness.config.json` layer constraints:

- `packages/core` → may depend on `types` and `graph` only ✓
- `packages/orchestrator` → may depend on `types` and `core` only ✓
- `packages/cli` → may depend on all lower layers ✓

No new package dependencies.

## Test Strategy

Every new pure module gets unit tests:

- `parallel-groups.test.ts` — linear, diamond, disconnected, cyclic, orphaned inputs.
- `meta-judge.test.ts` — rubric generation from feature, fix, docs, refactor commits; verifies no file bodies are read.
- `two-stage.test.ts` — filtering returns disjoint bundle sets; spec file exclusion.
- `tool-tiers.test.ts` — estimator math, tier selection across budgets, override precedence.
- `triage-router.test.ts` — one case per rule branch + default.

Pipeline integration is covered by extending `pipeline-orchestrator.test.ts`
with a `--thorough` + `--isolated` smoke test that confirms the rubric and
stages are threaded end-to-end.
