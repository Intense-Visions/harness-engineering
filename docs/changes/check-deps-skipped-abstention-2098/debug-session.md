# Debug Session: check-deps reports clean (exit 0) when the parser is unavailable (#2098)

Status: resolved
Started: 2026-09-24
Base SHA: b62f51d71863bbb5f45a5b666cd23d16925924f7
Error: No error is raised. `harness check-deps` prints a clean result, emits
`{ "findings": 0 }`, and exits 0 on a run where the TypeScript parser was
unavailable and therefore nothing was validated. The only trace is a
`console.warn` on stderr.

## Investigation Log

### Phase 1 — INVESTIGATE

1. `harness cleanup` (repo dist CLI, not the global 12.10.1 install) ran to
   completion. Findings are the repo's known doc-drift / dead-code noise floor
   (`docs/standard/*` symbol drift, 699 "dead" test setup files). NOTHING near
   the failure site: no finding on `packages/cli/src/commands/check-deps.ts`,
   `packages/core/src/constraints/dependencies.ts`, or
   `packages/cli/src/mcp/tools/architecture.ts`. Entropy is not a contributing
   cause here.

2. What exactly fails: nothing throws. `validateDependencies`
   (`packages/core/src/constraints/dependencies.ts:288-315`) checks
   `parser.health()`; when the parser is unavailable it returns
   `Ok({ valid: true, violations: [], graph: {nodes:[],edges:[]}, skipped: true,
reason: 'Parser unavailable' })` — under `fallbackBehavior: 'skip'` (line 296)
   and under `'warn'` (line 306, plus a `console.warn`).

3. Data flow, traced forward from that return:
   - `packages/cli/src/commands/check-deps.ts:127` hardcodes
     `fallbackBehavior: 'warn'`, so the CLI always lands on the line-306 branch.
   - `runCheckDeps` (line 132-146) consumes the `Ok` by iterating
     `depsResult.value.violations` ONLY. `git grep '\.skipped'` over
     `check-deps.ts` and `mcp/tools/architecture.ts` returns ZERO hits at this
     base SHA — the abstention flag the engine computed is discarded.
   - Consequence: `valid` stays `true`, `layerViolations` stays empty,
     `--findings-json` prints `{ "findings": 0 }`, and
     `runCheckDepsAction` exits `ExitCode.SUCCESS` (0).
   - `harness check-deps && deploy` therefore proceeds on a check that
     validated nothing. Every `--json` consumer sees a payload byte-identical
     to a genuinely clean repo.

4. Reachability caveat (recorded as an ASSUMPTION, see below): the bundled
   `TypeScriptParser.health()`
   (`packages/core/src/shared/parsers/typescript.ts:236-238`) currently returns
   a hardcoded `Ok({ available: true, version: '7.0.0' })`. So with the stock
   parser the abstention branch is not reachable from `check-deps` TODAY. The
   discarded-abstention contract gap is real regardless of which internal branch
   produces the flag, and `validateDependencies` is a public core export any
   adopter can call with their own `LanguageParser`.

## Hypotheses

### Phase 2 — ANALYZE: the working examples in this repo

- `packages/cli/src/commands/validate.ts` already models abstention correctly:
  it collects `result.unavailableChecks[]` (`{check, file?, reason, suggestion?}`),
  forces `complete: false` (line 748), and `resolveValidateExitCode` (line 860)
  returns `ExitCode.ZERO_DENOMINATOR` (3) — "the command ran but examined
  NOTHING", explicitly distinct from SUCCESS and from ERROR.
- `packages/cli/src/output/formatter.ts:57-66,142-167` already renders that
  channel: `unavailableChecks` on the `ValidationResult` prints
  `! Validation incomplete (N checks could not run)` and a `[unavailable]`
  prefix in QUIET mode. check-deps simply never populates it.
- `packages/core/src/review/mechanical-checks.ts:98-112` handles the `Err`
  channel from `validateDependencies` honestly; it does not read `skipped`
  either, but its default `fallbackBehavior` ('error') turns an unhealthy
  parser into an `Err`, so it cannot silently pass.
- Same defect family already fixed in this file: #1188 (zero modules ->
  `analysisNote`, refuse clean) and #1996 / PR #2097 (`Err` discarded ->
  `analysisErrors`, exit `ExitCode.ERROR`). The abstention channel is the third
  one, and the only one still discarded.

### Hypothesis (single, falsifiable)

`runCheckDeps` reports clean because it never reads `DependencyValidation.skipped`.
If that is the cause, then feeding `runCheckDeps` an engine result of
`Ok({valid:true, violations:[], graph:{...}, skipped:true, reason:'Parser unavailable'})`
must today produce `valid === true`, no recorded abstention, and
`process.exit(ExitCode.SUCCESS)`; and reading the flag must be sufficient to
flip all three. Tested by `packages/cli/tests/commands/check-deps-skipped-abstention.test.ts`,
which drives the engine boundary the same way the #1996 suite does.

## Assumptions

- A1: Driving the abstention at the `validateDependencies` boundary (vi.mock of
  the core export) is a faithful reproduction. Precedent: the #1996 suite
  (`check-deps-err-swallow.test.ts:20-24`) makes exactly this argument — a
  `Result` channel is part of the contract regardless of which internal branch
  produces it today. Needed because the bundled parser's `health()` is hardcoded
  available (finding 4 above), so the branch cannot be driven end-to-end without
  changing core's parser, which is out of this lane's scope.
- A2: `deps.fallbackBehavior` is the right home for the documented escape hatch
  (human decision Fork C / C1), reusing core's existing
  `LayerConfig.fallbackBehavior` enum verbatim rather than inventing a new knob.
- A3: `ExitCode.ZERO_DENOMINATOR` (3) is the right non-zero code — the repo's
  own definition of it is this exact situation, and `harness validate` already
  uses it for an incomplete run. An engine `Err` (#1996) keeps outranking it
  with `ExitCode.ERROR`.

## Deferred (not this lane)

- `TypeScriptParser.health()` hardcoding `available: true` means the CLI cannot
  currently reach the abstention branch with the stock parser. Worth its own
  issue; changing parser health is out of scope here.
- The MCP twin does not honour `deps.fallbackBehavior` (it uses core's default
  `'error'`, which already refuses to report clean). Left alone deliberately.
- `packages/core/src/ci/check-orchestrator.ts` is being fixed concurrently by
  the #2071 lane. NOT TOUCHED.

## Resolution

(filled in at Phase 4 close)

### Phase 4 — FIX (resolution)

Status: resolved
Resolved: 2026-09-24

Root cause: `runCheckDeps` consumed `validateDependencies`'s `Ok` by reading
`violations` only. The engine's own abstention verdict (`skipped` + `reason`)
was computed at `packages/core/src/constraints/dependencies.ts:296,306` and
discarded by every consumer, so an analysis that ran nothing was
indistinguishable from an analysis that found nothing.

Fix (three files, no change to core):

- `packages/cli/src/config/analysis-schema.ts` — `deps.fallbackBehavior`
  (`'skip' | 'warn' | 'error'`, default `skip`) maps straight onto core's
  existing `LayerConfig.fallbackBehavior`. `warn` is the documented escape
  hatch.
- `packages/cli/src/commands/check-deps.ts` — passes the configured policy
  instead of the hardcoded `'warn'`, reads `skipped`, records the abstention on
  the existing `unavailableChecks` channel (rendered by
  `OutputFormatter.formatValidation`, mirrored in `--json`), counts it in
  `--findings-json`, and exits `ExitCode.ZERO_DENOMINATOR` (3). Under `warn`
  the abstention is still reported; only the exit code is downgraded to 0.
- `packages/cli/src/mcp/tools/architecture.ts` — the MCP twin reads the same
  flag and returns `isError` naming the abstention instead of a clean payload.

Regression tests:

- `packages/cli/tests/commands/check-deps-skipped-abstention.test.ts` (10)
- `packages/cli/tests/mcp/tools/architecture-skipped-abstention.test.ts` (2)
- fixture `packages/cli/tests/fixtures/deps-abstention-warn/`

Red/green evidence (observed, not inferred):

- Before the fix: `Tests 7 failed | 3 passed (10)` — the exit-code assertion
  read `AssertionError: expected +0 to be 3`, and `--findings-json` printed
  `{"findings":0,"v":1,"check":"check-deps"}`.
- After the fix: `Tests 12 passed (12)` across both files.
- Revert-and-fail: the three source files restored to the base SHA with the
  tests left in place → `Tests 8 failed | 4 passed (12)`; restored → 12 passed.

Learnings: this repo already had the vocabulary for this verdict —
`unavailableChecks` on the formatter and `ExitCode.ZERO_DENOMINATOR` — built for
`harness validate`. The third member of the check-deps "reported clean without
running" family (#1188 zero modules, #1996 discarded `Err`, #2098 discarded
abstention) needed no new concepts, only the existing one wired up.
