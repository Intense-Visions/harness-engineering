# Craft: identifier naming in `packages/orchestrator/src/core`

> Spec for issue [#2001](https://github.com/Intense-Visions/harness-engineering/issues/2001) — filed by `craft-fleet` from a real `naming-craft` run (runId `f7927dfb-4051-4e15-93dd-0e3db3e5d05e`).

**Keywords:** identifier-naming, unit-in-name, exported-symbol-rename, deprecated-alias, public-api-surface, orchestrator-core, semver-minor, barrel-export

## Overview

`naming-craft` produced 5 findings above the noise floor over `packages/orchestrator/src/core`, spanning 3 identifiers. Three of the four named identifiers are **exported** from the package's public entry point; one is a function-local accumulator. This spec turns the critique into a landed rename that does **not** break `@harness-engineering/orchestrator` consumers.

### Goals

1. Every one of the 5 findings is resolved at its cited location.
2. No consumer of `@harness-engineering/orchestrator@0.24.x` breaks on upgrade.
3. The old names remain callable — and are provably reachable from the published entry point, not merely declared in their module file.

### Non-goals (YAGNI)

- Introducing a branded `DurationMs` type. The `NAME-R006` finding offers it as a conditional ("if the unit ever needs to vary"); the unit does not vary. Cut.
- Renaming `reconcile` to `computeReconciliation`. The finding offers it conditionally ("if the function returns a plan rather than mutating"). It does return a plan (`SideEffect[]`, no mutation) — but the fleet gate settled the target name as `reconcileRunningIssues`, which is the name the module's own doc comment already uses ("Reconcile running issues against their current tracker states", `packages/orchestrator/src/core/reconciliation.ts:6`). Cut the alternative.
- Renaming `effects` to `stateTransitionEffects` / `derivedSideEffects`. The finding's floor is `sideEffects` ("Consider `sideEffects` at minimum"); the fleet gate settled on that. Cut the richer alternatives.
- Any repo-wide `reconcile` find/replace. See Decision D3.

## Decisions made

### D1 — Rename **and** keep a deprecated alias for every exported symbol

`packages/orchestrator/package.json` declares no `"private": true` and sets `publishConfig.access: public` at version `0.24.1` [evidence: `packages/orchestrator/package.json`]. A bare exported rename is therefore a **public API break**, and this change is filed as a craft/polish item — not a breaking release.

For each of the three exported symbols, the real symbol takes the new name and the old name survives as an alias carrying `@deprecated`:

| old (deprecated alias) | new (real symbol)        | module                        |
| ---------------------- | ------------------------ | ----------------------------- |
| `calculateRetryDelay`  | `calculateRetryDelayMs`  | `src/core/retry.ts`           |
| `periodLengthMs`       | `resolvePeriodLengthMs`  | `src/core/budget-governor.ts` |
| `reconcile`            | `reconcileRunningIssues` | `src/core/reconciliation.ts`  |

Ships as a **minor** changeset for `@harness-engineering/orchestrator`.

### D2 — The alias must be proven reachable from the published entry point

This repo has a recurring defect class where an alias exists in a module but is never added to the barrel, silently converting "rename + alias" into "bare breaking rename". The barrel chain is:

```
packages/orchestrator/package.json  exports["."].types → ./dist/index.d.ts   (built from src/index.ts)
packages/orchestrator/src/index.ts:12   export * from './core/index'
packages/orchestrator/src/core/index.ts  export { calculateRetryDelay } from './retry';       (line 1)
                                          export { …, periodLengthMs } from './budget-governor'; (line 15)
                                          export { reconcile } from './reconciliation';        (line 22)
```

`src/index.ts` re-exports `./core/index` with a wildcard, so **both** names reach the public surface iff **both** appear in `src/core/index.ts`. The spec requires an executable proof, not a reading: a test that imports both names **from the package root** (`../../src/index`) and asserts `oldName === newName` by reference identity. A missing barrel line fails that test at import time.

### D3 — Symbol-scoped rename of `reconcile`, never repo-wide

`reconcile` is a common English word. A repo-wide grep matches ~460 locations across prose, CHANGELOGs, skill files, agent definitions, and four unrelated real symbols — `scripts/audit-exceptions.mjs:115` (`export function reconcile`), `KnowledgePipelineRunner.reconcile` (`packages/graph/src/ingest/KnowledgePipelineRunner.ts:491`), `PoolManager.reconcile` (`packages/local-models/src/pool/manager.ts:541`), and `harness roadmap reconcile` (the CLI subcommand). **None of these is the target.** The edit set is closed to the orchestrator core module, its one real importer, and its tests.

### D4 — `effects` needs no alias

`effects` at `packages/orchestrator/src/core/reconciliation.ts:22` is a function-local `const`. It is not exported and cannot be observed by any consumer. Rename in place; no alias, no changeset consequence.

## Technical design

### Edit set (closed)

| file                                                                | change                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/orchestrator/src/core/retry.ts`                           | rename fn → `calculateRetryDelayMs`; add `@deprecated` alias `calculateRetryDelay`                                          |
| `packages/orchestrator/src/core/budget-governor.ts`                 | rename fn → `resolvePeriodLengthMs`; update 2 internal call sites (lines 73, 239); add `@deprecated` alias `periodLengthMs` |
| `packages/orchestrator/src/core/reconciliation.ts`                  | rename fn → `reconcileRunningIssues`; rename local `effects` → `sideEffects`; add `@deprecated` alias `reconcile`           |
| `packages/orchestrator/src/core/index.ts`                           | export **both** names for each of the three symbols                                                                         |
| `packages/orchestrator/src/core/state-machine.ts`                   | update imports (lines 27, 28) and call sites (lines 198, 468) to the new names                                              |
| `packages/orchestrator/tests/core/retry.test.ts`                    | exercise `calculateRetryDelayMs`                                                                                            |
| `packages/orchestrator/tests/core/reconciliation.test.ts`           | exercise `reconcileRunningIssues`                                                                                           |
| `packages/orchestrator/tests/core/budget-governor.behavior.test.ts` | exercise `resolvePeriodLengthMs`                                                                                            |
| `packages/orchestrator/tests/core/naming-aliases.test.ts`           | **new** — D2's public-entry-point reachability proof                                                                        |
| `packages/orchestrator/README.md`                                   | the symbol table at line 135 names `calculateRetryDelay`                                                                    |
| `.changeset/*.md`                                                   | minor bump for `@harness-engineering/orchestrator`                                                                          |

### Alias shape

Each alias is a real exported binding annotated for the deprecation tooling, e.g.

```ts
/** @deprecated Use `calculateRetryDelayMs` instead. */
export const calculateRetryDelay = calculateRetryDelayMs;
```

A `const` alias (not `export { x as y }`) is used so the JSDoc `@deprecated` tag attaches to a declaration the TypeScript language service surfaces at consumer call sites with strikethrough. `export … from` re-export lines in the barrel carry the alias forward unchanged.

## Integration points

**Entry points.** `packages/orchestrator/src/core/index.ts` gains three barrel export lines (the deprecated aliases). No new CLI command, MCP tool, skill, or route.

**Registrations required.** Barrel export lines in `src/core/index.ts` — the only registration. `src/index.ts` already wildcards `./core/index`, so it needs no edit. Note this package's barrel is hand-maintained; it is **not** produced by `scripts/generate-core-barrel.mjs` (that script serves `@harness-engineering/core`), so no allowlist edit is needed here.

**Documentation updates.** `packages/orchestrator/README.md` symbol table (line 135). Historical plan documents under `docs/changes/orchestrator/` and `docs/changes/hybrid-orchestrator/` also name `calculateRetryDelay`, but those are dated records of past runs and are deliberately left untouched.

**Architectural decisions.** None. Small-tier change; D1–D4 are local to one module and do not rise to an ADR.

**Knowledge impact.** Reinforces the existing convention "a duration-valued identifier carries its unit suffix", already visible in `maxRetryBackoffMs`, `CONTINUATION_DELAY_MS`, `WEEK_MS`, `DAY_MS`.

## Success criteria

1. **When** a consumer imports `calculateRetryDelayMs`, `resolvePeriodLengthMs`, or `reconcileRunningIssues` from `@harness-engineering/orchestrator`, **the system shall** resolve each to the working implementation.
2. **When** a consumer imports the old name `calculateRetryDelay`, `periodLengthMs`, or `reconcile` from the package root, **the system shall** resolve it to the identical function object as the new name (`===`).
3. **If** any deprecated alias is declared in its module but omitted from `src/core/index.ts`, **then** `tests/core/naming-aliases.test.ts` shall fail.
4. Each old name carries a `@deprecated` JSDoc tag naming its replacement.
5. `packages/orchestrator/src/core/reconciliation.ts` contains no identifier `effects`; the accumulator is `sideEffects`.
6. `pnpm --filter @harness-engineering/orchestrator test` and `typecheck` pass.
7. The diff touches no file outside the edit-set table — in particular, none of `scripts/audit-exceptions.mjs`, `packages/graph/`, `packages/local-models/`, `packages/cli/src/commands/roadmap/reconcile.ts`.
8. A minor changeset for `@harness-engineering/orchestrator` exists.

## Implementation order

1. **Rename + alias the three modules** (`retry.ts`, `budget-governor.ts`, `reconciliation.ts`), including internal call sites and the local `effects` → `sideEffects`.
2. **Wire the barrel** — `src/core/index.ts` exports both names per symbol.
3. **Update the one real importer** — `src/core/state-machine.ts`.
4. **Update the three existing test files** to the new names; **add** `tests/core/naming-aliases.test.ts` (D2 proof, imports from `src/index`).
5. **Docs + changeset** — README symbol table, minor changeset.
6. **Verify** — typecheck, orchestrator suite, and a scope audit of `git diff --name-only` against the edit set.
