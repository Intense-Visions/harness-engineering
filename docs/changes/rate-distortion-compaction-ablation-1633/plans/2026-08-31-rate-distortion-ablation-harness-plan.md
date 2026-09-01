# Plan — Rate-distortion ablation harness + distortion model (report-only)

- **Issue:** #1633 · **Route:** feature · **Spec:** `../proposal.md`
- **Closing keyword:** `Refs #1633` (scoped slice)

## Task breakdown (dependency-ordered)

### T1 — Core taxonomy + replay types (`packages/core/src/rate-distortion/types.ts`)

- `InformationClass` union + `INFORMATION_CLASSES` canonical list.
- `Ablation` (`baseline` | `ablated`), `BASELINE` constant.
- `ReplayOutcome` (`rework`, optional `tokenCost`), `ReplayRun` (context partitioned by class),
  `ReplayObservation`, `ReplayRunner` (injected replay seam).
- **Checkpoint:** types compile; no IO.

### T2 — Ablation driver (`packages/core/src/rate-distortion/ablation.ts`)

- `applyAblation(run, ablation)` — pure context transform.
- `ablationSuite()` — baseline + one ablation per class.
- `runAblationSuite(runs, runner)` — drive an injected runner, one observation per (run × ablation);
  failures propagate (a report on silently-missing replays would be a lie).
- **Checkpoint:** unit tests for context removal + suite fan-out.

### T3 — Distortion model fit (`packages/core/src/rate-distortion/distortion-model.ts`)

- `fitDistortionModel(observations, options?)` — pair ablated with baseline per run, compute
  per-(taskClass × informationClass) delta stats (n, mean, sample std-dev, 95% CI half-width),
  classify `sensitive | insensitive | inconclusive` against `threshold`, stamp `version`/`fittedAt`.
- Optional advisory `prior` surfaced per cell (`priorDemand`); does not alter classification.
- **Checkpoint:** seeded-ground-truth test (the acceptance criterion) + statistics edge cases
  (n=0, n=1 → inconclusive; negative delta → insensitive; deterministic +delta → sensitive).

### T4 — Markdown serializer (`packages/core/src/rate-distortion/serialize.ts`)

- `serializeDistortionModel(model)` — sensitivity matrix table + per-cell detail table.
- **Checkpoint:** snapshot-ish assertions on headers + a known cell.

### T5 — Module barrel + core export

- `packages/core/src/rate-distortion/index.ts` re-exports the module.
- Add `rate-distortion` DIR_COMMENTS entry in `scripts/generate-core-barrel.mjs`; run
  `pnpm run generate:barrels` so `packages/core/src/index.ts` picks it up (stale barrel = CI red).

### T6 — CLI command (`packages/cli/src/commands/distortion.ts`)

- `harness distortion fit` — read `ReplayObservation` JSONL from
  `.harness/metrics/ablation-replays.jsonl` (or `--input`), fit, write
  `.harness/metrics/distortion-model.json`, emit Markdown to `--out`/stdout; `--json` global.
- `--version`, `--threshold`, `--prior` (fold `.harness/metrics/refinement-events.jsonl` as advisory prior).
- Regenerate `_registry.ts` via `pnpm run generate-barrel-exports`.
- **Checkpoint:** command test — round-trips a fixture observations file to a written model.

### T7 — Docs + gates

- `pnpm run generate-docs` (reference-docs freshness gate), reference/index doc link for coverage.
- `pnpm turbo build`, typecheck, lint, tests; `harness check-arch --update-baseline` only if a
  legitimately new module trips the baseline.

## Verification tiers

- **EXISTS:** module files + CLI command present; barrels regenerated.
- **SUBSTANTIVE:** seeded-ground-truth test passes; fit statistics correct on edge cases.
- **WIRED:** `harness distortion fit` reads a fixture observations file and writes a
  `distortion-model.json` whose cells match the seeded sensitivities end-to-end.

## Out of scope (deferred — manual reconciliation)

Live compaction-dial wiring; black-box replay driver; prior-into-classification; loop-closing
rework attribution. Substrate reused by MDL pruning (#1630).
