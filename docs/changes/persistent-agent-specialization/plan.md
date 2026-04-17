# Implementation Plan: Persistent Agent Specialization

Targets `docs/changes/persistent-agent-specialization/proposal.md`. Each task is scoped so it can land with green tests before moving on.

## Task 1 — Extend `ExecutionOutcome` with `taskType`

- Edit `packages/intelligence/src/outcome/types.ts`: add `TaskType` type alias and `taskType?: TaskType` field after `agentPersona`.
- Edit `packages/intelligence/src/outcome/connector.ts`: when `outcome.taskType` is defined, spread into node metadata (same pattern as `agentPersona`).
- Edit `packages/intelligence/tests/outcome/connector.test.ts`:
  - Add test that ingests outcome with `taskType: 'bugfix'` and asserts `node.metadata.taskType === 'bugfix'`.
  - Add test that omitting `taskType` leaves metadata unchanged.

**Verification:** `pnpm --filter @harness-engineering/intelligence test -- outcome` passes.

## Task 2 — Create `specialization/types.ts`

- Create `packages/intelligence/src/specialization/types.ts` with all types per proposal:
  - `TaskType` re-exported from outcome types
  - `ExpertiseLevel`, `SpecializationScore`, `SpecializationEntry`, `SpecializationProfile`, `WeightedRecommendation`
- Pure types; no logic, no tests needed.

## Task 3 — Create `specialization/temporal.ts` (TDD)

Create `packages/intelligence/tests/specialization/temporal.test.ts` first, covering:

- `decayWeight`:
  - `decayWeight(0, 30)` returns `1.0` (no decay at age 0)
  - `decayWeight(30, 30)` returns `~0.5` (half-life)
  - `decayWeight(60, 30)` returns `~0.25` (two half-lives)
  - `decayWeight(ageDays, halfLife)` is always in (0, 1]
  - Negative age treated as 0
- `temporalSuccessRate`:
  - All recent successes returns close to 1.0
  - All recent failures returns close to 0.0
  - Old successes + recent failures yields lower rate than flat average
  - Recent successes + old failures yields higher rate than flat average
  - Empty outcomes returns 0.5 (neutral prior)

Then implement `packages/intelligence/src/specialization/temporal.ts`:

- `decayWeight(ageDays, halfLifeDays)`: `Math.exp(-Math.LN2 / halfLifeDays * Math.max(0, ageDays))`
- `temporalSuccessRate(outcomes, config)`: weighted sum of success weights / total weights, with Laplace smoothing

**Verification:** temporal tests pass.

## Task 4 — Create `specialization/scorer.ts` (TDD)

Create `packages/intelligence/tests/specialization/scorer.test.ts` first, covering:

- `computeSpecialization`:
  - Returns empty array when no outcomes exist
  - Groups by `(persona, systemNodeId, taskType)` correctly
  - Computes temporal success rate using decay
  - Computes consistency score from rolling windows
  - Computes volume bonus with log scale
  - Composite is weighted combination: `0.6 * temporal + 0.25 * consistency + 0.15 * volume`
  - Filtering by persona/system/taskType narrows results
  - `minSamples` threshold filters out low-volume entries
  - Wildcard taskType `'*'` aggregates across all task types
- `computeExpertiseLevel`:
  - <5 samples → novice regardless of success rate
  - 5-14 samples + ≥0.6 success rate → competent
  - 15-29 samples + ≥0.7 success rate → proficient
  - 30+ samples + ≥0.75 success rate → expert
  - Low success rates demote level by one tier
- `buildSpecializationProfile`:
  - Returns profile with entries, strengths (top 3), weaknesses (bottom with >50% failure)
  - Overall level is median of entry levels
- `weightedRecommendPersona`:
  - Specialized personas score higher than unspecialized ones
  - Multiplier is in [0.5, 1.5] range
  - Personas with no specialization data get neutral multiplier 1.0
  - Results sorted by weightedScore descending
  - taskType filter applies to specialization lookup

Then implement scorer.ts per proposal.

**Verification:** all scorer tests pass; full package tests green.

## Task 5 — Create `specialization/persistence.ts` (TDD)

Create `packages/intelligence/tests/specialization/persistence.test.ts` first, covering:

- `loadProfiles`: returns empty store when file doesn't exist
- `loadProfiles`: reads back what `saveProfiles` wrote
- `saveProfiles`: writes valid JSON with version field
- `refreshProfiles`: computes and persists profiles for all personas with outcomes

Then implement persistence.ts:

- Read/write `.harness/specialization-profiles.json`
- `refreshProfiles` calls `buildSpecializationProfile` for each persona found in outcomes

**Verification:** persistence tests pass with temp directories.

## Task 6 — Public API wiring + integration

- Edit `packages/intelligence/src/index.ts` with all new re-exports per proposal.
- Run `pnpm --filter @harness-engineering/intelligence build` to verify dts emits correctly.
- Run `pnpm --filter @harness-engineering/intelligence test` for full suite.
- Run `harness validate` at workspace root.

## Task 7 — Learnings + cleanup

- Append learnings to `.harness/learnings.md`.
- Verify all tests pass, no lint errors.

## Risk & Rollback

- Risk is local to `@harness-engineering/intelligence`. No consumers call the new API yet.
- The `ExecutionOutcome.taskType` extension is additive. Older writers that don't set it produce identical metadata.
- Rollback: revert the commit; no migrations.
