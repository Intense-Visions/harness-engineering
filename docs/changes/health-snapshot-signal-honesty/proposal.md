# Reconcile health-snapshot `passed` flags with active signals

**Keywords:** health-snapshot, signal-honesty, signal-registry, drift, single-source-of-truth, strength-007, skill-recommendation, dogfood

## Overview

`health-snapshot.json` can report a check as `passed: true` while `signals[]` lists a contradicting problem. Observed in the dogfooded `.harness/health-snapshot.json`: `security.passed: true` alongside 16 findings, and `docs.passed: true` alongside 27,481 undocumented symbols (Source: github#528 / audit Pass 1 #2). The snapshot is the harness's own self-model — it is consumed by `dispatch-engine.ts`, `recommendation-engine.ts`, `dispatcher.ts`, and `insights.ts` — so a false-green snapshot biases skill recommendation and every health readout the harness produces about itself.

**Root cause.** `checks.X.passed` and `signals[]` are computed on two independent paths with no invariant tying them together:

- `checks.X.passed` is taken from `assess_project`'s own thresholds (`packages/cli/src/skill/health-snapshot.ts:162`, `buildCheckMap`).
- `signals[]` is derived separately from granular counts by `deriveSignals` → `SIGNAL_RULES` (`packages/cli/src/skill/health-snapshot.ts:104`).

The `strength-007` detector that is supposed to catch this disagreement has itself drifted: its `CHECK_SIGNAL_MAP` (`packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.ts:12`) looks for signal names that do not exist in the real vocabulary — `entropy-drift`, `dependency-violations`, `doc-coverage`, `lint-issues` — while `deriveSignals` actually emits `dead-code`, `drift`, `circular-deps`, `layer-violations`, `doc-gaps` (and no lint signal at all). As a result the detector only ever catches the `security` mismatch by luck; entropy/deps/docs mismatches are silent false-negatives.

The defect is therefore a **two-source-of-truth drift**: the signal↔check mapping is declared independently in two places and they have already diverged. The fix removes that class of drift, not just the current symptom.

### Goals

1. A snapshot produced by `captureHealthSnapshot` can never report `passed: true` for a check that has an active contradicting signal.
2. A single canonical signal↔check contract lives in `@harness-engineering/core`, consumed by both the cli capture path and the core `strength-007` detector, so the two cannot drift again.
3. `strength-007` is corrected to the real signal vocabulary and demoted to a defense-in-depth backstop (it should no longer be the primary guarantee).

### Non-Goals (YAGNI)

- Re-tuning signal thresholds (e.g. `doc-gaps` firing at `> 0` undocumented). Whether a threshold is well-calibrated is a separate concern; this change only enforces consistency between `passed` and the signals as they are currently derived.
- Read-path reconciliation of stale caches (`loadCachedSnapshot`). The write path is the single producer; stale pre-fix snapshots self-heal on regeneration (git HEAD change or > 1 hour) and `strength-007` flags any that persist.
- Changing what `assess_project` itself computes, or the `deriveSignals` thresholds/output for given inputs.

## Decisions made

| Decision                 | Choice                                                                                      | Rationale                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapping location         | Canonical contract in `core`; both consumers import it                                      | The bug is a two-source drift; one shared contract eliminates the class. Respects the cli→core layer direction (cli may import core; core may not import cli).                        |
| Contract shape           | A single `SIGNAL_REGISTRY` list with everything else derived                                | Maximally drift-proof: one list yields the name constants, the check→signal map, and the metrics-only set. Adding a signal is a single entry that flows everywhere automatically.     |
| Reconciliation semantics | `passed = assessPassed && !contradictingSignalPresent` (conjunction, monotonic toward fail) | Can demote a dishonest pass to fail but never promote a real failure to green. Preserves `assess` failures that have no signal (e.g. lint, which has no signal rule).                 |
| Apply point              | Write path only — inside `captureHealthSnapshot`, after `deriveSignals`                     | `captureHealthSnapshot` is the single producer of snapshots; stale caches self-heal within ≤ 1 hour or on the next commit; `strength-007` is the backstop for anything that persists. |

## Technical design

### New module: `packages/core/src/health-signals/index.ts`

The single source of truth for the health-signal vocabulary and its mapping to checks.

```ts
export type CheckKey = 'deps' | 'entropy' | 'security' | 'perf' | 'docs' | 'lint';
export type SignalCategory = 'structure' | 'quality' | 'security' | 'performance' | 'coverage';

// THE single source of truth. `check: null` marks a metrics-only signal that
// maps to no check (it must never affect any `passed` flag). `category` is the
// independent parallel-safety bucket (null = uncategorized). Declaration order
// is significant: HEALTH_SIGNAL_NAMES is derived from it.
export const SIGNAL_REGISTRY = [
  { name: 'circular-deps',      check: 'deps',     category: 'structure'   },
  { name: 'layer-violations',   check: 'deps',     category: 'structure'   },
  { name: 'high-coupling',      check: null,       category: 'structure'   },
  { name: 'high-complexity',    check: null,       category: null          },
  { name: 'low-coverage',       check: null,       category: 'coverage'    },
  { name: 'dead-code',          check: 'entropy',  category: 'quality'     },
  { name: 'drift',              check: 'entropy',  category: 'quality'     },
  { name: 'security-findings',  check: 'security', category: 'security'    },
  { name: 'doc-gaps',           check: 'docs',     category: 'quality'     },
  { name: 'perf-regression',    check: 'perf',     category: 'performance' },
  { name: 'anomaly-outlier',    check: null,       category: null          },
  { name: 'articulation-point', check: null,       category: null          },
] as const satisfies ReadonlyArray<{
  name: string;
  check: CheckKey | null;
  category: SignalCategory | null;
}>;

export type SignalName = (typeof SIGNAL_REGISTRY)[number]['name'];

// Derived: check -> contradicting signal names (many-to-one). Built by grouping
// SIGNAL_REGISTRY on `check`, skipping null. No second hand-maintained list.
export const CHECK_SIGNAL_MAP: Record<CheckKey, SignalName[]> = /* derived */;

// Derived: signal name -> parallel-safety category, EXCLUDING null categories.
// Re-exported by the cli as SIGNAL_CATEGORIES (was a separate 9-entry literal).
export const SIGNAL_CATEGORY_MAP: Record<string, SignalCategory> = /* derived */;

// Derived: ordered list of the 12 health-signal names. The cli spreads this
// into its HEALTH_SIGNALS const ahead of the cli-local change/domain signals.
export const HEALTH_SIGNAL_NAMES: readonly SignalName[] = /* derived */;

// Pure reconciliation: for each check, passed stays true only if assess passed
// AND no contradicting signal is present. Never flips false -> true.
export function reconcilePassed<C extends Record<string, { passed: boolean }>>(
  checks: C,
  signals: readonly string[],
): C;
```

`lint` intentionally has no registry entry (no lint signal is derived today); its `passed` is therefore governed solely by `assess`, which the conjunction preserves.

The registry single-sources three previously-overlapping lists (SC4 unification): the cli's `SIGNAL_CATEGORIES` (`dispatch-engine.ts`) is now `= SIGNAL_CATEGORY_MAP`, and the health portion of the cli's `HEALTH_SIGNALS` (`recommendation-types.ts`) is spread from `HEALTH_SIGNAL_NAMES`. The cli-local `CHANGE_SIGNALS` (4) and `DOMAIN_SIGNALS` (12) stay in the cli — they are a dispatch concern, not health vocabulary, and the layer rule forbids core importing them. `HEALTH_SIGNALS` remains the same 28 names in the same order (12 health, 4 change, 12 domain); `SIGNAL_CATEGORIES` keeps the same 9 keys/values; the metrics-only signals (`high-complexity`, `anomaly-outlier`, `articulation-point`) stay uncategorized (`getSignalCategory` returns null).

### cli: `packages/cli/src/skill/health-snapshot.ts`

- Replace the signal-name string literals inside `SIGNAL_RULES` (line 104) with the imported `SignalName` constants from `@harness-engineering/core`. This is a no-op for behavior; it guarantees the cli emits exactly the registry's names.
- In `captureHealthSnapshot` (around line 381), after `const signals = deriveSignals(checks, metrics)`, reconcile before building the snapshot:

```ts
const signals = deriveSignals(checks, metrics);
const reconciledChecks = reconcilePassed(checks, signals);
// snapshot.checks = reconciledChecks
```

`deriveSignals` stays pure and unchanged; reconciliation is one added pass over the already-computed checks and signals.

### core: `strength-007-snapshot-signal-mismatch.ts`

- Delete the local `CHECK_SIGNAL_MAP` and import the derived map from `../../health-signals` (relative import within core).
- The detection loop is otherwise unchanged, but it now iterates the correct signal names for every check, closing the entropy/deps/docs false-negative. It remains `error`-severity and serves as defense-in-depth for hand-edited or stale snapshots that bypass the write-path reconciliation.

## Integration Points

- **Entry Points:** new `packages/core/src/health-signals/` module; modified `captureHealthSnapshot` (cli) and the `strength007` rule (core). No new CLI command, MCP tool, skill, or route.
- **Registrations Required:** add `export * from './health-signals'` to `packages/core/src/index.ts` (barrel export, near the existing `harness-strength` export at line 213). No skill-tier or route registration.
- **Documentation Updates:** none user-facing. Module-level TSDoc on `SIGNAL_REGISTRY` stating it is the single source of truth for signal names and their check mapping.
- **Architectural Decisions:** the decision **"Canonical signal↔check contract owned by core"** warrants a short ADR — it establishes core as the owner of the health-signal vocabulary and the cli→core consumption direction, so a future contributor does not re-introduce a local map (the exact drift this fixes). The other three decisions are local implementation choices and do not need standalone ADRs.
- **Knowledge Impact:** new concept `health-signal-contract` — a single registry from which the check map is derived, with `passed` reconciled monotonically-toward-fail against active signals. Relationship: both `strength-007` and `captureHealthSnapshot` _depend-on_ the registry.

## Success Criteria

1. A snapshot returned by `captureHealthSnapshot` never has `checks[k].passed === true` while any signal in `CHECK_SIGNAL_MAP[k]` is present in `signals[]` (test: inject contradicting counts, assert demotion).
2. Reconciliation is a conjunction: a check that `assess` reports as failing with no corresponding signal stays `passed: false` (regression test, exercised via `lint`).
3. Metrics-only signals (`check: null`, e.g. `high-coupling`) never change any `passed` flag.
4. `SIGNAL_REGISTRY` is the only literal declaration of health-signal names and their parallel-safety categories; `CHECK_SIGNAL_MAP`, `SignalName`, `SIGNAL_CATEGORY_MAP`, and `HEALTH_SIGNAL_NAMES` are derived from it. The cli's `SIGNAL_CATEGORIES` re-exports `SIGNAL_CATEGORY_MAP` (no second category literal) and `HEALTH_SIGNALS` spreads `HEALTH_SIGNAL_NAMES` for its health portion (no second health-name list); only the cli-local change/domain signals remain cli-owned. Equivalence preserved: `SIGNAL_CATEGORIES` has the same 9 keys/values and `HEALTH_SIGNALS` the same 28 names in the same order as before.
5. `strength-007` consumes the derived map and fires on entropy/deps/docs mismatches — a regression test reproduces the prior silent false-negative and proves it now fails closed.
6. `deriveSignals` output is unchanged for given `(checks, metrics)` inputs (no signal-vocabulary regression).
7. `harness validate`, typecheck, lint, and the full test suite pass.

## Implementation order

1. **Core contract.** Create `health-signals/` module (`SIGNAL_REGISTRY`, derived `CHECK_SIGNAL_MAP` and `SignalName`, `reconcilePassed`) with unit tests for the derivation and the conjunction/monotonicity property; add the barrel export.
2. **Wire cli.** Point `SIGNAL_RULES` at the imported names; add the `reconcilePassed` call in `captureHealthSnapshot`; add tests for mismatch-demotion and the lint conjunction case.
3. **Fix strength-007.** Import the derived map, delete the local one; add a regression test for the entropy/deps/docs false-negative.
4. **ADR + knowledge note**, then `harness validate`.
