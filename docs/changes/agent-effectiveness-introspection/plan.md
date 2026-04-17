# Implementation Plan: Agent Effectiveness Introspection

Targets `docs/changes/agent-effectiveness-introspection/proposal.md`. Each task is scoped so it can land with green tests before moving on.

## Task 1 — Extend `ExecutionOutcome` with `agentPersona`

- Edit `packages/intelligence/src/outcome/types.ts`: add `agentPersona?: string` after existing fields; document intent in the JSDoc.
- Edit `packages/intelligence/src/outcome/connector.ts`: when `outcome.agentPersona` is not `undefined`, spread `{ agentPersona: outcome.agentPersona }` into the node metadata object. Do not include the key when absent (keeps metadata shape unchanged for existing callers).
- Edit `packages/intelligence/tests/outcome/connector.test.ts`:
  - Extend an existing success-outcome test (or add a new `it` block) that ingests an outcome with `agentPersona: 'task-executor'` and asserts `node.metadata.agentPersona === 'task-executor'`.
  - Add a test that ingesting an outcome without `agentPersona` leaves `metadata.agentPersona === undefined` (i.e. the key is not present).

**Verification:** `pnpm --filter @harness-engineering/intelligence test -- outcome` passes.

## Task 2 — Add `effectiveness/types.ts`

- Create `packages/intelligence/src/effectiveness/types.ts` with `PersonaEffectivenessScore`, `BlindSpot`, `PersonaRecommendation` per proposal §2.
- Pure types; no logic, no tests needed here.

## Task 3 — Add `effectiveness/scorer.ts` (TDD)

Create `packages/intelligence/tests/effectiveness/scorer.test.ts` first, covering:

- `computePersonaEffectiveness`:
  - returns empty array when no outcomes exist
  - groups by `(persona, systemNodeId)` and counts successes/failures correctly
  - applies the Laplace formula `(s + 1) / (s + f + 2)` (numeric expected values)
  - filtering by `persona` narrows the result
  - filtering by `systemNodeId` narrows the result
  - outcomes missing `agentPersona` are skipped (historical data still works but isn't persona-attributed)
  - outcomes with no `outcome_of` edges do not emit rows (no system attribution)
- `detectBlindSpots`:
  - threshold enforcement: below `minFailures` returns nothing even at 100% failure rate
  - threshold enforcement: below `minFailureRate` returns nothing even with many failures
  - when both thresholds are met, returns a `BlindSpot` with raw failure rate
  - persona filter narrows results
- `recommendPersona`:
  - sorts personas by average smoothed success rate desc
  - a persona with all-success history on requested systems outranks a persona with all-failure history
  - a persona with no history for a system contributes the `0.5` neutral prior (test: one persona with perfect history on system A and none on system B; with two systems, expected score is `(1.0_smoothed + 0.5) / 2`)
  - `candidatePersonas` option restricts the return set
  - `minSamples` option filters out personas below the total-sample threshold
  - tie-breaking: when two personas tie on score, higher `totalSamples` wins
  - returns `[]` when no candidates can be found (no persona-attributed outcomes AND no `candidatePersonas` supplied)

Then implement `packages/intelligence/src/effectiveness/scorer.ts`:

- Helper `gatherOutcomes(store)` builds a `Map<persona, Map<systemNodeId, {successes, failures}>>` by:
  1. `store.findNodes({ type: 'execution_outcome' })`
  2. For each node, read `metadata.agentPersona` (skip when undefined).
  3. For each outbound `outcome_of` edge (`store.getEdges({ from: node.id, type: 'outcome_of' })`), bucket the result into successes/failures by the outcome's `metadata.result`.
- `computePersonaEffectiveness` iterates the map and emits `PersonaEffectivenessScore` rows with the Laplace-smoothed rate, honouring `persona` / `systemNodeId` filters.
- `detectBlindSpots` uses the same map, computes raw `failures / (failures + successes)`, filters on `minFailures` (default 2) and `minFailureRate` (default 0.5). Returns sorted by `failureRate` desc, then `failures` desc.
- `recommendPersona` derives the candidate set (either `opts.candidatePersonas` or the keys of the gathered map), then for each candidate averages per-system smoothed rates. Systems with zero observations for that candidate contribute `0.5`. Returns sorted by score desc, ties broken by `totalSamples` desc.

**Verification:** the new test file passes end-to-end; full package tests remain green.

## Task 4 — Public API wiring

- Edit `packages/intelligence/src/index.ts` and add the new function/type re-exports at the bottom.
- Verify with `pnpm --filter @harness-engineering/intelligence build` that the `dts` emits the new names without ambiguity.

## Task 5 — Root validate + learnings

- Run `pnpm --filter @harness-engineering/intelligence lint`, `typecheck`, `test`, `build`.
- Run the project-wide `harness validate` (CLI) to catch any arch/forbidden-import surprises. Spot check: `intelligence` has no layer entry and depends only on `graph` + `types`, so nothing new should fail.
- Append a short summary to `.harness/learnings.md` describing the feature and any follow-ups (e.g. future: surface recommendations in orchestrator).

## Risk & Rollback

- Risk is local to `@harness-engineering/intelligence`. No consumers call the new API yet, so worst case the module is unused.
- The `ExecutionOutcome` extension is additive. Older writers that don't set `agentPersona` continue to produce identical node metadata to today.
- Rollback: revert the commit; no migrations to unwind.
