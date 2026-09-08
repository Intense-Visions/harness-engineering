# Extract `reportSemanticRegression` out of `runCheckMode`

> Craft elevation for CODE-R003 (issue #1743). Behaviour-preserving altitude split of the
> `harness comprehend --check` entrypoint.

## Overview and goals

`runCheckMode` in `packages/cli/src/commands/comprehend.ts` opens as a tidy freshness reporter —
resolve the CI mode, run the compile check, warn on skips, report stale units — and then drops a
full altitude into the `--since` semantic-regression narrative: base/head ref reads, unreadable-ref
handling, `pr`-vs-`main` branching, and three separate logger calls, all inlined into the same
function body [evidence: `packages/cli/src/commands/comprehend.ts:254-342`].

The goal is to leave the outer function telling **one** story ("is the comprehension substrate
fresh, and what is the exit verdict?") by lifting the regression narrative into a named
`reportSemanticRegression(...)` that returns a `{ regressed, refUnreadable }` pair.

**Non-goal:** any change to observable CLI behaviour, to `runCheckMode`'s signature, or to the
`--since` gate's verdict semantics. This is a pure altitude split.

**Strategy grounding:** advances the _Ceiling-raising via LLM judgment_ track — this item is a
`code-craft` finding elevated through the craft pipeline, which is exactly the loop that track
funds [evidence: `STRATEGY.md#tracks`].

## Decisions made

| #   | Decision                                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The extracted function stays **in `comprehend.ts`** (exported for tests) rather than moving to `src/comprehension/regression.ts`. | The finding scopes the surface as "within-unit, signature unchanged". `regression.ts` is deliberately a **pure, logger-free** detection module (`detectSemanticRegressions`, `readSemanticMapAtRef`) [evidence: `packages/cli/src/comprehension/regression.ts:1-160`]; pushing user-facing logger prose into it would smear the reporting/detection boundary that module currently holds cleanly. `comprehend.ts` already owns the CLI-narration layer. |
| D2  | The function takes the git seam (`RefReadDeps`) as a **required parameter**, not as an internally-constructed default.            | `runCheckMode` already owns `opts.projectRoot` and is the only caller; passing `defaultRefReadDeps(opts.projectRoot)` in keeps the extracted function disk- and git-free, so its contract is unit-testable without a git fixture.                                                                                                                                                                                                                       |
| D3  | The logger is an **injected seam with a `logger` default**, typed `Pick<typeof logger, 'error' \| 'warn' \| 'success'>`.          | Matches the file's established seam convention — `stageCompiledUnits(..., stage = defaultStagePaths, format = defaultFormatPaths)` and `resolveChangedScope(surface, { warn }, ...)` [evidence: `packages/cli/src/commands/comprehend.ts:119,237`] — so the new code reads like its neighbours and its three log lines are assertable.                                                                                                                  |
| D4  | The `if (opts.since)` guard stays **at the call site**; the extracted function assumes a `since` ref.                             | Keeps the extracted function total (no "did nothing" third state) and keeps the `{ regressed: [], refUnreadable: false }` no-`--since` default visible in the outer function, where the verdict is computed.                                                                                                                                                                                                                                            |
| D5  | The `context` default (`opts.context ?? 'main'`) stays resolved **at the call site** and is passed in explicitly.                 | The default is a CLI-flag concern, not a reporting concern; the extracted function should be honest that the context is always supplied.                                                                                                                                                                                                                                                                                                                |

## Technical design

### New exported surface (`packages/cli/src/commands/comprehend.ts`)

```ts
/** The `--since` gate's two outputs: which modules regressed, and whether a ref was unreadable. */
export interface SemanticRegressionReport {
  /** Modules that regressed `present → absent` (always `[]` under `context: 'pr'`). */
  regressed: string[];
  /** True when base or HEAD could not be read — refuse to report a pass. */
  refUnreadable: boolean;
}

export function reportSemanticRegression(
  since: string,
  context: RegressionContext,
  deps: RefReadDeps,
  log: Pick<typeof logger, 'error' | 'warn' | 'success'> = logger
): SemanticRegressionReport;
```

### Behaviour moved (verbatim, not rewritten)

1. `readSemanticMapAtRef(since, deps)` and `readSemanticMapAtRef('HEAD', deps)`.
2. Unreadable-ref path: either map `null` ⇒ `refUnreadable = true`, `log.error(...)` naming which
   ref failed, and **no** regression detection runs.
3. `context: 'pr'` path: `detectCommittedSemanticOnBranch` advisory `log.warn` when non-empty, then
   the `log.success` "static-only PR path" line. `regressed` stays `[]` (the detector itself already
   short-circuits `pr` to `[]`).
4. `context: 'main'` path: `log.error` listing the regressed modules when non-empty, else the
   `log.success` "no semantic regressions" line.

### `runCheckMode` after the split

```ts
const context: RegressionContext = opts.context ?? 'main';
const { regressed, refUnreadable } = opts.since
  ? reportSemanticRegression(opts.since, context, defaultRefReadDeps(opts.projectRoot))
  : { regressed: [] as string[], refUnreadable: false };
```

The `ok` computation (`result.ok && regressed.length === 0 && !refUnreadable`) and the `ciMode ===
'refresh'` main-pass block are untouched, in their existing order.

## Integration points

- **Entry Points** — none created. `harness comprehend --check [--since <ref>] [--context pr|main]`
  is unchanged; `reportSemanticRegression` is a module-internal export consumed only by
  `runCheckMode` and by the co-located unit test.
- **Registrations Required** — none. The symbol is not re-exported from any barrel and is not part
  of `@harness-engineering/core`, so `scripts/generate-core-barrel.mjs` needs no allowlist edit.
- **Documentation Updates** — none. No CLI flag, command, or output string changes, so
  `docs/reference/cli-commands.md` does not drift.
- **Architectural Decisions** — None. A within-unit extraction with an unchanged public surface does
  not rise to an ADR.
- **Knowledge Impact** — None new; the ADR 0109 §4 / ADR 0116 §4 rationale that motivates the gate
  moves with the code as its doc comment.

## Success criteria

1. **When** `harness comprehend --check --since <ref>` runs and both refs read cleanly and no module
   regressed, **the system shall** exit `SUCCESS` and emit exactly the same success line as before.
2. **If** either the base ref or `HEAD` is unreadable, **then the system shall not** report a pass:
   `reportSemanticRegression` returns `refUnreadable: true`, logs an error naming which ref failed,
   and never calls the regression detector.
3. **When** `context` is `'pr'` and the branch committed semantic, **the system shall** emit the
   advisory warning and the static-only success line, and return `regressed: []`.
4. **When** `context` is `'main'` and modules regressed, **the system shall** return those modules in
   `regressed` and log the error listing them.
5. `runCheckMode`'s signature is byte-identical to `418f5e188`, and every pre-existing test in
   `packages/cli/src/commands/comprehend.test.ts`, `packages/cli/tests/comprehension/**`, and
   `packages/cli/tests/e2e/comprehend-*.e2e.test.ts` passes **unmodified**.
6. New unit tests pin the `{ regressed, refUnreadable }` contract on all four paths above, with the
   git seam injected (no git, no disk).

## Implementation order

1. **Phase 1 — extract.** Add `SemanticRegressionReport` + `reportSemanticRegression` above
   `runCheckMode`; move the `--since` block into it verbatim (logger calls become `log.*`); replace
   the block in `runCheckMode` with the destructuring call.
2. **Phase 2 — pin.** Add a `describe('reportSemanticRegression …')` block to
   `packages/cli/src/commands/comprehend.test.ts` covering unreadable-base, unreadable-HEAD, the
   `pr` advisory + success path, `main`-with-regressions, and `main`-clean.
3. **Phase 3 — verify.** `pnpm turbo build`, typecheck, run the comprehension test surface plus the
   `comprehend` e2e suites; confirm no `docs/reference/*` drift.
