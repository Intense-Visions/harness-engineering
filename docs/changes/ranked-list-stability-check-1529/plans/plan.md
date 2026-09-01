# Plan — Ranking-stability gate for ranked outputs (#1529)

Trace of the brainstorming → autopilot (plan → execute → verify → review) run for GitHub issue
#1529, executed autonomously in a roadmap-fleet build lane.

## Problem (brainstorming)

See `../proposal.md`. In short: every ranked output the harness emits presents a precise order
that a 90-day, 1,957-repo telemetry study showed is frequently not reproducible across two
windows, and a second trap (mean-of-two-windows banding) produces invalid analyses. Build a
shared gate: compute over two windows, report the rank correlation, degrade to tiers when low,
and define bands on one window only.

## Grounding (verified, not trusted)

- Canonical ranked emitters located: hotspot/churn (`packages/core/src/solutions/scan-candidates/
hotspot.ts`, consumed by `packages/cli/src/commands/compound/scan-candidates.ts`), critical
  paths (`packages/core/src/performance/critical-path.ts`), skill recommendations
  (`packages/cli/src/skill/recommendation-engine.ts`), graph anomaly adapters
  (`packages/graph/src/entropy/*`).
- Hotspots chosen as the wired emitter: its ranking is already a function of a git time window,
  so "two adjacent windows" is a real computation (primary = most-recent window; secondary =
  the equal-length window immediately before it), not a synthetic split. This is the roadmap
  shard's dogfooding ask.
- `exactOptionalPropertyTypes: true` (tsconfig.base.json) — optional option fields declared
  `?: T | undefined`.
- Core exports flow through an auto-generated barrel (`scripts/generate-core-barrel.mjs`); a new
  top-level module directory is picked up automatically (verified: `export * from './ranking'`
  appears after `pnpm run generate:barrels`).
- `Tier` already exported by `./harness-strength` at the core barrel → the ranking module's tier
  type is exported as `RankTier` to avoid a barrel collision (TS2308).

## Tasks

1. **Shared library** — `packages/core/src/ranking/stability.ts` + `index.ts`:
   `ScoredItem`, `RankingWindow`, `StabilityReport`, `RankTier`, `BandValidation`,
   `StableRanking`; `spearmanRankCorrelation` (tie-corrected), `assignTiers`,
   `validateBands`, `checkRankStability`. Exported via `export * from './ranking'` in the core
   barrel.
2. **Wiring** — extend `hotspot.ts` with `computeStableHotspots` (two adjacent git windows →
   gate). Extend `assemble.ts` to carry the `StabilityReport` line and render tiers when
   unstable. Point `scan-candidates.ts` at `computeStableHotspots`.
3. **Tests** — `stability.test.ts` (Spearman incl. ties/reverse/thin-overlap; stable stays
   ordered; unstable degrades to tiers; report always carries correlation + windows;
   `assignTiers`; `validateBands` one-window-defined/other-validated). Extend `hotspot.test.ts`
   (`computeStableHotspots` over two windows) and `assemble.test.ts` (stability line + tier
   grouping).
4. **Gates** — build CLI, typecheck, lint, prettier, regenerate barrels, `ci check` arch.

## Execution notes / deviations

- **Barrel collision** — renamed the exported tier type `Tier` → `RankTier` (harness-strength
  already exports `Tier`). Scan-candidates hotspot types re-exported under `Scan*` prefix per the
  existing convention in that barrel.
- **Complexity gate** — the first cut of `assembleCandidateReport` tripped a NEW cyclomatic-
  complexity item (11 > 10) and pushed the aggregate into `arch: fail`. Refactored the report
  assembler into `renderUndocumentedFixes` / `renderPatternCandidates` / `renderTiers` helpers;
  `arch` returned to `warn` (baseline-clean for this change). Pre-existing metabolism drift on
  `origin/main` HEAD (basal-token-metabolism merge) accounts for the remaining warn-level
  items — untouched here.
- **Pre-existing generated drift** — `packages/cli/src/commands/_registry.ts` was stale on
  `origin/main` (missing `createMcpRefinementDemandCommand`); regenerating the barrels to
  satisfy `generate:barrels:check` incidentally corrects it. Included as a visible generated
  edit.

## Verification (WIRED tier)

- Live entry point traced: `harness compound scan-candidates` → `runCompoundScanCandidatesCommand`
  → `computeStableHotspots` → `checkRankStability`, and the emitted report renders the stability
  line / tiers. Not a set-but-never-read addition.
- `packages/core` ranking + scan-candidates suites green (Spearman, gate, tiers, band
  validation, two-window hotspots, assemble rendering).
- Build, typecheck (core + cli), eslint (0 warnings), prettier, `generate:barrels:check`, and
  `harness ci check --stage pre-commit` all pass.

## Scope / closing keyword

`Refs #1529` — shared library complete; wired into one emitter (hotspots). Uncovered emitters
named in the proposal (critical paths, craft/audit targets, skill recommendations, graph anomaly
adapters) remain follow-ups that adopt the shared gate.
