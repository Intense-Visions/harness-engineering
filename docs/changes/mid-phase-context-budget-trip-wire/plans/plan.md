# Plan: Mid-Phase Context-Budget Trip Wire

**Date:** 2026-08-25 | **Spec:** `docs/changes/mid-phase-context-budget-trip-wire/proposal.md` | **Issue:** 1403 | **Tasks:** 6 | **Time:** ~24 min | **Integration Tier:** medium

## Goal

Add a pure, deterministic core helper (`evaluateContextBudget`) that classifies a turn's resident-token count as `ok | warn | trip` against absolute, window-keyed anchors, plus the autopilot / harness-execution / skill-authoring documentation that references it as an intra-turn converge-then-checkpoint-and-restart discipline.

## Observable Truths (Acceptance Criteria)

1. `evaluateContextBudget(usedTokens, window)` returns `ok` below `warnAt`, `warn` in `[warnAt, tripAt)`, and `trip` at/above `tripAt`, for each of the three bands (`1m`, `200k`, `local`). Ties trip (`>=`).
2. A `200_000` window resolves to `warnAt=80_000` / `tripAt=100_000` (band `200k`); a `1_000_000` window resolves to `warnAt=250_000` / `tripAt=350_000` (band `1m`); a `128_000` local window resolves to `warnAt=38_400` / `tripAt=48_000` (band `local`).
3. `overrides` pin explicit `warnAt` / `tripAt` without changing band selection, and `tripAt` is clamped `>= warnAt`.
4. `utilization` (`usedTokens / window`) and `effectiveUtilization` (`usedTokens / (window × 0.6)`, RULER) are exposed as derived display values and are never the trip condition; `EFFECTIVE_WINDOW_RATIO === 0.6`.
5. The public surface (`ContextBudgetVerdict`, `ContextWindowBand`, `ContextBudgetThresholds`, `ContextBudgetEvaluation`, `EFFECTIVE_WINDOW_RATIO`, `resolveContextBudgetThresholds`, `evaluateContextBudget`) is exported from `@harness-engineering/core` and the generated barrel is fresh (`pnpm run generate:barrels:check` passes).
6. Autopilot, harness-execution, and skill-authoring SKILL.md each document the trip-wire discipline; plugin mirrors regenerate cleanly (`pnpm run generate:plugin:check` passes).
7. Sources are cited in the module JSDoc: Chroma Context Rot, NoLiMa, RULER, Lost-in-the-Middle, Anthropic Effective Context Engineering, Horthy/Pragmatic Engineer.

## File Map

- CREATE `packages/core/src/context/context-budget-trip-wire.ts`
- CREATE `packages/core/tests/context/context-budget-trip-wire.test.ts`
- MODIFY `packages/core/src/context/index.ts` (add barrel exports)
- MODIFY generated root barrel via `pnpm run generate:barrels` (auto-discovered; no `scripts/generate-core-barrel.mjs` allowlist edit)
- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (new "Context-Budget Trip Wire" subsection)
- MODIFY `agents/skills/claude-code/harness-execution/SKILL.md` (mid-turn check in the per-task loop)
- MODIFY `agents/skills/claude-code/harness-skill-authoring/SKILL.md` (guidance note, sibling to instruction-density note ~line 253)
- MODIFY plugin command mirrors via `pnpm run generate:plugin` (regenerated from SKILL.md edits)

## Skeleton

_Not produced — task count (6) is below the standard-mode threshold (8) and the spec's Implementation Order is fully locked._

## Uncertainties

- [DEFERRABLE] Exact prose wording of the three SKILL.md sections. Content is constrained by the spec's "Documented discipline" list; wording finalized during execution.
- [ASSUMPTION] `128K` local window is `128_000` (not `131_072`) — the spec success criterion `warn≈38_400` is `0.30 × 128_000`, confirming decimal-K. Test uses `128_000`.

## Tasks

### Task 1: Core helper module + tests (TDD)

**Depends on:** none | **Files:** `packages/core/tests/context/context-budget-trip-wire.test.ts`, `packages/core/src/context/context-budget-trip-wire.ts` | **Owns:** `packages/core/src/context/context-budget-trip-wire.ts`

Mirror the sibling `instruction-density.ts` module and its colocated test exactly: pure, dependency-free, JSDoc-heavy, deterministic, no IO.

1. Create the test `packages/core/tests/context/context-budget-trip-wire.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  evaluateContextBudget,
  resolveContextBudgetThresholds,
  EFFECTIVE_WINDOW_RATIO,
} from '../../src/context/context-budget-trip-wire';

describe('resolveContextBudgetThresholds', () => {
  it('resolves the 1m band with absolute anchors for a >= 900_000 window', () => {
    expect(resolveContextBudgetThresholds(1_000_000)).toEqual({
      window: 1_000_000,
      warnAt: 250_000,
      tripAt: 350_000,
      band: '1m',
    });
  });

  it('resolves the 200k band with absolute anchors for a >= 150_000 window', () => {
    expect(resolveContextBudgetThresholds(200_000)).toEqual({
      window: 200_000,
      warnAt: 80_000,
      tripAt: 100_000,
      band: '200k',
    });
  });

  it('resolves the local band with ratio-derived anchors below 150_000', () => {
    // 128K local: round(0.30 * 128_000)=38_400, round(0.375 * 128_000)=48_000.
    expect(resolveContextBudgetThresholds(128_000)).toEqual({
      window: 128_000,
      warnAt: 38_400,
      tripAt: 48_000,
      band: 'local',
    });
  });

  it('keys bands off the class boundaries (>= is inclusive)', () => {
    expect(resolveContextBudgetThresholds(900_000).band).toBe('1m');
    expect(resolveContextBudgetThresholds(899_999).band).toBe('200k');
    expect(resolveContextBudgetThresholds(150_000).band).toBe('200k');
    expect(resolveContextBudgetThresholds(149_999).band).toBe('local');
  });

  it('lets overrides pin explicit anchors without changing the band', () => {
    const t = resolveContextBudgetThresholds(200_000, { warnAt: 60_000, tripAt: 90_000 });
    expect(t).toEqual({ window: 200_000, warnAt: 60_000, tripAt: 90_000, band: '200k' });
  });

  it('clamps an override tripAt below warnAt up to warnAt', () => {
    const t = resolveContextBudgetThresholds(200_000, { tripAt: 10_000 });
    expect(t.warnAt).toBe(80_000);
    expect(t.tripAt).toBe(80_000);
  });
});

describe('evaluateContextBudget', () => {
  it('returns ok below warnAt', () => {
    expect(evaluateContextBudget(79_999, 200_000).verdict).toBe('ok');
  });

  it('returns warn in [warnAt, tripAt)', () => {
    expect(evaluateContextBudget(80_000, 200_000).verdict).toBe('warn');
    expect(evaluateContextBudget(99_999, 200_000).verdict).toBe('warn');
  });

  it('returns trip at/above tripAt (ties trip)', () => {
    expect(evaluateContextBudget(100_000, 200_000).verdict).toBe('trip');
    expect(evaluateContextBudget(120_000, 200_000).verdict).toBe('trip');
  });

  it('classifies each band at its own warn boundary', () => {
    expect(evaluateContextBudget(250_000, 1_000_000).verdict).toBe('warn');
    expect(evaluateContextBudget(350_000, 1_000_000).verdict).toBe('trip');
    expect(evaluateContextBudget(38_400, 128_000).verdict).toBe('warn');
    expect(evaluateContextBudget(48_000, 128_000).verdict).toBe('trip');
  });

  it('exposes derived display-only utilization and effectiveUtilization', () => {
    const e = evaluateContextBudget(120_000, 200_000);
    expect(e.utilization).toBeCloseTo(0.6, 10);
    expect(e.effectiveUtilization).toBeCloseTo(120_000 / (200_000 * EFFECTIVE_WINDOW_RATIO), 10);
    expect(EFFECTIVE_WINDOW_RATIO).toBe(0.6);
  });

  it('carries the resolved thresholds and usedTokens onto the evaluation', () => {
    const e = evaluateContextBudget(90_000, 200_000);
    expect(e).toMatchObject({
      window: 200_000,
      warnAt: 80_000,
      tripAt: 100_000,
      band: '200k',
      usedTokens: 90_000,
      verdict: 'warn',
    });
  });
});
```

2. Run the test — observe it fail (module does not exist yet):
   `pnpm --filter @harness-engineering/core test -- context-budget-trip-wire`
3. Create the implementation `packages/core/src/context/context-budget-trip-wire.ts`:

```ts
/**
 * Mid-phase context-budget trip wire.
 *
 * Autopilot keeps context fresh *between* phases by dispatching a distinct cold
 * subagent per state, but nothing watches a single long-running turn for context
 * creep *within* its own turn. This module supplies a pure, deterministic helper
 * that classifies a turn's resident-token count (input + output + tool results)
 * as `ok | warn | trip` against absolute, window-keyed anchors, so a running
 * agent can converge-then-checkpoint-and-restart before it drifts into the
 * degraded "dumb zone".
 *
 * The threshold policy is token-anchored and window-keyed rather than a flat
 * percentage: degradation is driven by absolute resident tokens, so a flat
 * percent is wrong on large windows (40% of 1M ~= 400K resident tokens is deep
 * in the dumb zone). Anchors are keyed to a window *class* (1m / 200k / local).
 * Utilization percentages are derived DISPLAY-only values — the trip fires on
 * the absolute token count, never on a percentage.
 *
 * Sources: Chroma _Context Rot_ (2025); NoLiMa (arXiv 2502.05167); RULER
 * (arXiv 2404.06654); _Lost in the Middle_ (arXiv 2307.03172); Anthropic
 * _Effective Context Engineering_ (2025); Horthy / _The Pragmatic Engineer_
 * (2025). See `docs/research/dex-horthy-humanlayer-comparison-analysis.md`
 * [HORTHY-1].
 */

/** A turn's resident-token classification. */
export type ContextBudgetVerdict = 'ok' | 'warn' | 'trip';

/** The window *class* a nominal window resolves to. */
export type ContextWindowBand = '1m' | '200k' | 'local';

/** Absolute, window-keyed trip anchors (resident tokens). */
export interface ContextBudgetThresholds {
  /** Nominal window the anchors were keyed to. */
  window: number;
  /** Resident-token count at/above which to soft-warn (converge + flush state). */
  warnAt: number;
  /** Resident-token count at/above which to hard-trip (checkpoint-and-restart). */
  tripAt: number;
  /** Band label the window resolved to. */
  band: ContextWindowBand;
}

/** A classified evaluation of a turn's resident-token count. */
export interface ContextBudgetEvaluation extends ContextBudgetThresholds {
  /** `ok` below `warnAt`, `warn` in `[warnAt, tripAt)`, `trip` at/above `tripAt`. */
  verdict: ContextBudgetVerdict;
  /** The measured resident-token count that was classified. */
  usedTokens: number;
  /** Derived DISPLAY-only utilization vs nominal window (`usedTokens / window`). */
  utilization: number;
  /**
   * Derived DISPLAY-only utilization vs the RULER effective window
   * (`usedTokens / (window * EFFECTIVE_WINDOW_RATIO)`).
   */
  effectiveUtilization: number;
}

/** RULER effective-window ratio: usable context ~= 0.6 x nominal window. */
export const EFFECTIVE_WINDOW_RATIO = 0.6;

// Band boundaries and anchors (resident tokens).
const ONE_M_MIN_WINDOW = 900_000;
const TWO_HUNDRED_K_MIN_WINDOW = 150_000;
const ONE_M_WARN = 250_000;
const ONE_M_TRIP = 350_000;
const TWO_HUNDRED_K_WARN = 80_000;
const TWO_HUNDRED_K_TRIP = 100_000;
const LOCAL_WARN_RATIO = 0.3;
const LOCAL_TRIP_RATIO = 0.375; // midpoint of the research's 35-40% hard-trip range

/**
 * Resolve the absolute warn/trip anchors for a nominal window size.
 *
 * The window is matched to the nearest defined class at-or-below: `1m` and
 * `200k` use absolute research anchors (floors keyed to a window class, not a
 * fixed fraction of the exact window); `local` derives from ratios because
 * sub-128K windows vary widely. `overrides` pin explicit anchors without
 * changing band selection; `tripAt` is clamped to be `>= warnAt` so the
 * two-stage warn-then-trip ordering always holds.
 */
export function resolveContextBudgetThresholds(
  window: number,
  overrides?: Partial<Pick<ContextBudgetThresholds, 'warnAt' | 'tripAt'>>
): ContextBudgetThresholds {
  let band: ContextWindowBand;
  let warnAt: number;
  let tripAt: number;

  if (window >= ONE_M_MIN_WINDOW) {
    band = '1m';
    warnAt = ONE_M_WARN;
    tripAt = ONE_M_TRIP;
  } else if (window >= TWO_HUNDRED_K_MIN_WINDOW) {
    band = '200k';
    warnAt = TWO_HUNDRED_K_WARN;
    tripAt = TWO_HUNDRED_K_TRIP;
  } else {
    band = 'local';
    warnAt = Math.round(LOCAL_WARN_RATIO * window);
    tripAt = Math.round(LOCAL_TRIP_RATIO * window);
  }

  if (overrides?.warnAt !== undefined) warnAt = overrides.warnAt;
  if (overrides?.tripAt !== undefined) tripAt = overrides.tripAt;
  if (tripAt < warnAt) tripAt = warnAt; // clamp: a trip anchor never precedes the warn anchor

  return { window, warnAt, tripAt, band };
}

/**
 * Classify a turn's resident-token count as `ok | warn | trip`.
 *
 * The caller supplies the already-measured `usedTokens` (input + output + tool
 * results) — prefer the model's real cumulative usage counter, falling back to
 * a `chars/4` estimate only when usage is not surfaced. Ties trip (`>=`):
 * being *at* an anchor already means degradation risk. `utilization` and
 * `effectiveUtilization` are derived DISPLAY-only values and never the trip
 * condition.
 */
export function evaluateContextBudget(
  usedTokens: number,
  window: number,
  overrides?: Partial<Pick<ContextBudgetThresholds, 'warnAt' | 'tripAt'>>
): ContextBudgetEvaluation {
  const thresholds = resolveContextBudgetThresholds(window, overrides);
  const verdict: ContextBudgetVerdict =
    usedTokens >= thresholds.tripAt ? 'trip' : usedTokens >= thresholds.warnAt ? 'warn' : 'ok';

  return {
    ...thresholds,
    verdict,
    usedTokens,
    utilization: usedTokens / window,
    effectiveUtilization: usedTokens / (window * EFFECTIVE_WINDOW_RATIO),
  };
}
```

4. Run the test — observe it pass:
   `pnpm --filter @harness-engineering/core test -- context-budget-trip-wire`
5. Commit: `feat(context): add mid-phase context-budget trip wire helper`

### Task 2: Barrel export + regenerate barrels

**Depends on:** Task 1 | **Files:** `packages/core/src/context/index.ts` | **Category:** integration

1. Add the export block to `packages/core/src/context/index.ts` immediately after the instruction-density export block (after the `SkillInstructionDensityReport` / `ParsedSection` type exports, ~line 80), mirroring its JSDoc style:

```ts
/**
 * Mid-phase context-budget trip wire — classifies a turn's resident-token count
 * as ok | warn | trip against absolute, window-keyed anchors, the intra-turn
 * complement to autopilot's between-phase cold dispatch ([HORTHY-1]).
 */
export {
  resolveContextBudgetThresholds,
  evaluateContextBudget,
  EFFECTIVE_WINDOW_RATIO,
} from './context-budget-trip-wire';
export type {
  ContextBudgetVerdict,
  ContextWindowBand,
  ContextBudgetThresholds,
  ContextBudgetEvaluation,
} from './context-budget-trip-wire';
```

2. Regenerate the root barrel (auto-discovered; no `scripts/generate-core-barrel.mjs` allowlist edit):
   `pnpm run generate:barrels`
3. Verify freshness: `pnpm run generate:barrels:check`
4. Rebuild core so the new export resolves downstream: `pnpm turbo build --filter @harness-engineering/core`
5. Commit: `feat(context): export context-budget trip wire from core barrel`

### Task 3: Autopilot SKILL.md — "Context-Budget Trip Wire" subsection

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md` | **Category:** integration

1. Add a new `### Context-Budget Trip Wire` subsection under the `## Process` section (after line 386 region, i.e. within Process, ahead of Harness Integration). Content must state:
   - The two-stage policy: `warn` ⇒ tell the running agent to converge and flush state to disk; `trip` ⇒ checkpoint-and-restart into a **cold subagent** seeded with the **distilled** (summarized, not raw-truncated — _Lost in the Middle_) state file, mirroring autopilot's between-phase cold dispatch.
   - The window-keyed anchor table (`1m`: warn 250K / trip 350K; `200k`: warn 80K / trip 100K; `local`: ~30% / ~37.5%).
   - Measurement rules: measured on TOTAL RESIDENT tokens (input + output + tool results); prefer the model's real usage counter over tokenizer estimation, fall back to `chars/4`.
   - How `trip` maps onto the existing recovery-commit (`[autopilot][recovery]` prefix) + cold re-dispatch machinery in the EXECUTE retry path.
   - Cite `evaluateContextBudget` from `@harness-engineering/core` as the classifier.
2. Regenerate plugin mirrors (deferred to Task 6, which runs after all three SKILL.md edits).
3. Commit: `docs(autopilot): document context-budget trip-wire discipline`

### Task 4: harness-execution SKILL.md — mid-turn check in the per-task loop

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/harness-execution/SKILL.md` | **Category:** integration

1. Add a mid-turn check step to the per-task EXECUTE loop (the numbered "For each task" list beginning ~line 147, e.g. a new step after step 6 "Update state after each task"). Content must state:
   - After each task, evaluate resident tokens with `evaluateContextBudget(usedTokens, window)`.
   - On `warn`: converge and flush `state.json` / `handoff.json` to disk before continuing.
   - On `trip`: write a **distilled** handoff (summarized state, not raw-truncated) and stop for cold re-dispatch — the task-executor does not push past a `trip`.
   - `ok`: proceed to the next task normally.
2. Regenerate plugin mirrors (deferred to Task 6).
3. Commit: `docs(execution): add mid-turn context-budget check to per-task loop`

### Task 5: skill-authoring SKILL.md — guidance note

**Depends on:** Task 4 | **Files:** `agents/skills/claude-code/harness-skill-authoring/SKILL.md` | **Category:** integration

1. Add a short guidance note as a sibling to the existing instruction-density note (Phase 4, step 3, ~line 253). Add a new bullet (e.g. step "3b" style or an appended sub-bullet under "Write `## Process`") stating: a skill describing a long-running turn should reference the trip-wire discipline and cite `evaluateContextBudget` — classify resident tokens as `ok | warn | trip`, converge + flush on `warn`, checkpoint-and-restart into a cold subagent on `trip`.
2. Regenerate plugin mirrors (deferred to Task 6).
3. Commit: `docs(skill-authoring): add context-budget trip-wire guidance note`

### Task 6: Regenerate plugin mirrors + final verification

**Depends on:** Task 5 | **Files:** plugin command mirrors (generated), build outputs | **Category:** integration

1. Regenerate plugin command mirrors from the three SKILL.md edits:
   `pnpm run generate:plugin`
2. Verify plugin freshness: `pnpm run generate:plugin:check`
3. Verify barrel freshness: `pnpm run generate:barrels:check`
4. Full build: `pnpm turbo build`
5. Targeted tests green: `pnpm --filter @harness-engineering/core test -- context-budget-trip-wire`
6. Build the CLI, then run validate:
   `node packages/cli/dist/bin/harness.js validate`
7. Commit any regenerated mirror files: `chore(plugin): regenerate command mirrors for trip-wire docs`

## Verification Commands (whole change)

- `pnpm turbo build`
- `pnpm --filter @harness-engineering/core test -- context-budget-trip-wire`
- `pnpm run generate:barrels:check`
- `pnpm run generate:plugin:check`
- `node packages/cli/dist/bin/harness.js validate` (build the CLI first)

All commands must be prefixed with `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"` (Node 22 required).

## Traceability

| Observable Truth                                | Delivered by     |
| ----------------------------------------------- | ---------------- |
| 1 (three-band verdicts, ties trip)              | Task 1           |
| 2 (exact band anchors: 200K/1M/128K)            | Task 1           |
| 3 (overrides + clamp)                           | Task 1           |
| 4 (derived utilization, EFFECTIVE_WINDOW_RATIO) | Task 1           |
| 5 (barrel export + freshness)                   | Task 2           |
| 6 (three SKILL.md docs + plugin freshness)      | Tasks 3, 4, 5, 6 |
| 7 (source citations in JSDoc)                   | Task 1           |

## Notes / Known Hazards

- SKILL.md mirrors across `cursor` / `codex` / `gemini-cli` are symlinks to `claude-code`; editing the claude-code copy updates all four. Do not hand-copy. `generate:plugin` regenerates the gemini `.toml` and plugin command mirrors.
- Pre-commit runs a fail-closed arch gate + block-no-verify; if a red-on-main baseline blocks a commit, that is pre-existing (not caused by this pure-additive change).
- `generate:barrels` is auto-discovery based (the `context/` dir has its own `index.ts`) — no `scripts/generate-core-barrel.mjs` allowlist edit is required, unlike root-level core exports.
