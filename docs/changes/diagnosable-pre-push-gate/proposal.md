# Make the pre-push test gate diagnosable — surface the failing test on failure

**Status:** proposed
**Tier:** small (dev-workflow / infra)
**Issue:** #1094
**Keywords:** pre-push, turbo, vitest, json-reporter, test-diagnosability, husky, coverage-gate, flake-triage

## Overview

The pre-push gate runs `turbo run test:coverage --affected --concurrency=2` in
`.husky/pre-push`. When a package (historically `cli` / `orchestrator`) fails under
compound parallel load, turbo's interleaved output can exit non-zero **without a
surviving `FAIL <testname>` line** in the captured stream. The gate that blocks the
push therefore does not tell the contributor _what_ failed — which trains the blind
"push again until green" reflex that also waves through real regressions (issue
#1094's core argument).

**Goal:** make a failed pre-push gate _diagnosable_. On a non-zero test run, emit a
per-package machine-readable test report and have the hook print a concise
"these tests failed" summary (package + test title + file + first failure line).
The gate's verdict becomes informative on failure without changing its authority.

### Problem boundary

- **In scope:** per-package JSON test report gated behind a pre-push-only env flag;
  a summarizer script the hook invokes on non-zero exit; the `.husky/pre-push`
  wiring for both the affected and full-fallback branches; `.gitignore` for the
  transient report artifact.
- **Out of scope:** the underlying shared-resource contention (ENOENT-on-mkdir,
  fixed-port listeners) named in issue #1094 suggestion #2. That root-cause work is
  tracked separately and is **already substantially addressed on `main`** — see
  Triage below.

### Triage — what is already solved (do not rebuild)

Issue #1094 predates a wave of root-cause deflakes that have since merged. This spec
deliberately does **not** re-deflake; it references the merged work and adds only the
diagnosability layer that is still missing:

| PR    | State  | What it addressed                                                                                 |
| ----- | ------ | ------------------------------------------------------------------------------------------------- |
| #1153 | MERGED | Deflaked timing-sensitive core/orchestrator tests under coverage                                  |
| #1155 | MERGED | Deflaked the orchestrator/cli `test:coverage` gauntlet under v8 coverage load                     |
| #1168 | MERGED | Deflaked signals command-runner subprocess flake (#1143) + Windows orchestrator ENOENT            |
| #1183 | MERGED | Fixed scanners self-excluding when the checkout path contains a skip-dir segment (e.g. `.claude`) |

The per-test-timeout headroom in `packages/cli/vitest.config.mts` (#620) and the
`--concurrency=2` cap are also already in place. **Conclusion: #1094's root-cause
contention is largely moot post-deflakes; the remaining actionable, non-whack-a-mole
gap is diagnosability.** That is this spec's single deliverable.

## Decisions made

1. **Reporter format: vitest built-in `json` reporter (jest-compatible shape).**
   Chosen over `junit` because the JSON shape (`testResults[].assertionResults[]`
   with `status`, `title`, `ancestorTitles`, `failureMessages`) is trivially and
   robustly parseable in a tiny Node script with zero XML dependency. JUnit would
   need an XML parser for no added signal.

2. **Activation is gated behind a pre-push-only env flag (`HARNESS_PREPUSH=1`).**
   Mirrors the existing `HARNESS_COVERAGE` argv-detection pattern already in the
   vitest configs. Normal `vitest run`, `npm run test`, and **CI** never set the
   flag, so their behavior is byte-identical — the reporter is inert everywhere
   except the local pre-push gate. This keeps CI strict and untouched.

3. **A single shared helper, imported by every package's vitest config.** A
   `scripts/vitest-prepush-reporter.mjs` helper returns the reporter fragment
   (or `{}` when the flag is unset). Each `packages/*/vitest.config.mts` spreads it.
   DRY over inlining the same ternary into 12 configs.

4. **The summarizer degrades gracefully.** If no report files exist (flag not
   honored, turbo cache short-circuit, older config), the script prints a single
   honest "no machine-readable reports found" line and exits 0 — it never
   manufactures a failure and never changes the gate's exit code. The hook, not the
   summarizer, owns the `exit 1`.

5. **Stale reports are cleaned before the run.** The hook removes any prior
   `.vitest-report.json` before invoking turbo, so the summarizer only ever reads
   this-run results (turbo cache-hits = the package passed last run, so a lingering
   report would be a 0-failure one anyway; the clean makes correctness explicit).

6. **The optional reliability tweak (#1094 suggestion #3) is deliberately EXCLUDED.**
   A retry-once — even scoped to the local gate — masks exactly the intermittent
   real failure the gate exists to catch, and issue #1094 itself argues that
   retry-to-green is the harmful reflex. Root-cause deflakes (above) already
   restored reliability, so a `--concurrency=1` special-case would only _slow_ the
   gate for no remaining flake to suppress. Diagnosability is the honest fix:
   a red push now tells you what to look at instead of inviting a blind retry.
   Recorded as an explicit non-goal so a future reader sees it was considered.

## Technical design

### Shared reporter helper — `scripts/vitest-prepush-reporter.mjs`

```js
// Returns a vitest `test` config fragment. Active only under the pre-push gate
// (HARNESS_PREPUSH=1), which .husky/pre-push sets for its test:coverage run.
// Everywhere else (plain `vitest run`, CI) it returns {} — zero behavior change.
export function prepushTestOptions() {
  if (process.env.HARNESS_PREPUSH !== '1') return {};
  return {
    // Keep the normal console output ('default') AND write a machine-readable
    // per-package report the pre-push summarizer parses on failure. Resolved
    // relative to each package's vitest root, so every package writes its own.
    reporters: ['default', ['json', { outputFile: '.vitest-report.json' }]],
  };
}
```

### Per-package vitest config change (×12)

```ts
import { prepushTestOptions } from '../../scripts/vitest-prepush-reporter.mjs';
// ...
export default defineConfig({
  test: {
    ...prepushTestOptions(),
    globals: true,
    // ...unchanged
  },
});
```

Spread first so an active `reporters` fragment is set without clobbering any
explicit key (no config currently sets `reporters`).

### Summarizer — `scripts/summarize-test-failures.mjs`

- Globs `packages/*/.vitest-report.json`.
- For each report, collects `testResults` entries whose `assertionResults` contain a
  `status === 'failed'` (falls back to file-level `status`/`message` when a suite
  failed to load — e.g. an import/collection error with no assertions).
- Prints a compact, grouped summary:

  ```
  ────────────────────────────────────────────────
  Pre-push test gate FAILED — failing tests:

    @harness-engineering/orchestrator
      ✗ orchestrator API › binds an ephemeral port
        tests/api/server.test.ts
        AssertionError: expected 19458 to be ...
    @harness-engineering/cli
      ✗ scan-config › applies coverage-aware budget
        tests/commands/scan.test.ts
        Error: spawn timeout after 90000ms

  2 failing test(s) across 2 package(s).
  Re-run a single package locally: cd packages/<pkg> && npm run test:coverage
  ────────────────────────────────────────────────
  ```

- Exits **0** always (informational). The hook owns the blocking `exit 1`.
- If zero reports found: prints one "no machine-readable reports found — see turbo
  output above" line and exits 0. Never fabricates a failure.

### `.husky/pre-push` wiring

Both the affected branch and the full-fallback branch change from:

```sh
pnpm exec turbo run test:coverage --affected --concurrency=2
```

to:

```sh
# Clear stale per-package reports so the summarizer only reads this run.
find packages -maxdepth 2 -name .vitest-report.json -delete 2>/dev/null || true
# HARNESS_PREPUSH activates the json reporter in each package's vitest config.
# On non-zero exit, print a concise failing-test summary, then preserve the
# blocking exit code (turbo's interleaved stream may drop the FAIL line, #1094).
if ! HARNESS_PREPUSH=1 pnpm exec turbo run test:coverage --affected --concurrency=2; then
  node scripts/summarize-test-failures.mjs || true
  exit 1
fi
```

`HARNESS_PREPUSH=1` is set inline (per-command), so only turbo's children see it;
the rest of the hook and any ambient tooling are unaffected. turbo 2.x defaults to
**strict** env mode, which strips undeclared env vars from task processes, so the
flag is declared `globalPassThroughEnv: ["HARNESS_PREPUSH"]` in `turbo.json` to reach
each vitest worker. It is declared as pass-through (not `globalEnv`) on purpose so it
is intentionally **not** part of any turbo cache key: it toggles a diagnostic
side-output only, never the test result, so a coverage cache hit stays valid whether
or not the run was under the pre-push gate (and a cache hit means the package passed,
so it has no failures to summarize anyway).

## Integration points

- **Entry Points:** `.husky/pre-push` (existing hook — new summarizer call on the
  non-zero test path); new `scripts/summarize-test-failures.mjs`; new
  `scripts/vitest-prepush-reporter.mjs`.
- **Registrations Required:** `.gitignore` — add `**/.vitest-report.json` so the
  transient report never gets committed. No barrel/skill/route registration.
- **Documentation Updates:** None required (dev-workflow internal; the hook comment
  documents the mechanism inline). AGENTS.md unaffected.
- **Architectural Decisions:** None rise to a standalone ADR — this is a
  hook/test-config/script change with no runtime or published-package impact.
- **Knowledge Impact:** None for the graph; the triage table above captures the
  "#1094 root cause already deflaked; remaining gap = diagnosability" fact.

## Success criteria

1. **Given** the pre-push gate runs and a package's `test:coverage` exits non-zero,
   **then** the hook prints a summary naming each failing test's package, test title,
   source file, and first failure line — even when turbo's interleaved stream
   contains no surviving `FAIL` line.
2. **Given** the test run passes, **then** the summarizer is not invoked and hook
   output is unchanged from today (no new noise on the happy path).
3. **Given** a normal `vitest run` / `npm run test` / CI run (no `HARNESS_PREPUSH`),
   **then** no `.vitest-report.json` is written and reporter behavior is
   byte-identical to before — verified by CI staying green on all 3 OS + enforce.
4. **Given** no report files exist on a failure (e.g. turbo failed before any vitest
   started), **then** the summarizer prints one honest "no reports found" line and
   the push is still blocked (`exit 1`) — the gate never silently passes.
5. **Given** the hook itself is edited, **then** a happy-path push still succeeds
   (the hook is syntactically valid POSIX sh and preserves `set -e` semantics).

## Implementation order

1. Add `scripts/vitest-prepush-reporter.mjs` (shared helper).
2. Add `scripts/summarize-test-failures.mjs` (parser + summary printer) with a
   self-contained unit test over a fixture report.
3. Wire the helper into all 12 `packages/*/vitest.config.mts`.
4. Update `.husky/pre-push` (both branches) + `.gitignore`.
5. Verify: pre-push flag off → no report, behavior unchanged; flag on with a forced
   failing test → summary prints and exit is non-zero; `pnpm format:check`,
   `generate:plugin:check`, changeset-check, baselines byte-identical.
