# Debug Session: scan-config wall-clock budget reddens windows-latest

Status: resolved
Started: 2026-09-09
Error: `AssertionError: expected 113 to be less than 100` at `packages/cli/tests/commands/scan-config.test.ts:266:23`
CI: run 34303979771, job `build-and-test (windows-latest, 22)`, sha `164c704cd` (push, `chore: version packages (#2108)`)

## Investigation Log

### Step 1 — Entropy analysis

`harness cleanup -t all` reports the repo's standing drift and dead-code noise (docs/standard
link rot, 560 template/setup files flagged dead). **Neither `packages/cli/src/commands/scan-config.ts`
nor `packages/cli/tests/commands/scan-config.test.ts` appears in any finding.** No entropy near the
failure site; working tree clean at `02a18a5ec`.

### Step 2 — Read the error carefully

From the job log, verbatim:

```
❯ tests/commands/scan-config.test.ts (24 tests | 1 failed) 914ms
FAIL tests/commands/scan-config.test.ts > runScanConfig > edge cases > scans large config files within 100ms
AssertionError: expected 113 to be less than 100
 ❯ tests/commands/scan-config.test.ts:266:23
Test Files  1 failed | 733 passed | 5 skipped (739)
```

- **What failed:** one assertion — `expect(elapsed).toBeLessThan(budgetMs)`. Not a throw, not a
  timeout, not an unhandled rejection.
- **Where:** `scan-config.test.ts:266`. The other 23 tests in the file passed, and 733 other test
  files in the leg passed.
- **Input:** an 11,260-byte `CLAUDE.md` of clean prose — a payload with no findings in it at all.
- **Expected vs actual:** 113ms observed against a 100ms budget. **13ms** over.
- **The assertion was the test's only assertion.** Deleting it would leave an empty test body.

The run is a version-packages push. Nothing in `scan-config.ts` changed.

### Step 3 — Reproduce

Not reproducible on this host, and the _reason_ is the finding. Measured directly against the exact
payload (250 clean lines, 11,260 bytes, warmed, mean of 5):

```
TIME reps=250  bytes=11260  mean=0.89ms
```

**0.89ms against a 100ms budget is 112x of headroom — and CI lost anyway.** That is the whole
diagnosis: the number is measuring the runner, not the scan. No budget value is defensible when a
112x margin is not enough.

Scaling on the same host, to rule out the code being the suspect:

| clean lines | bytes   | mean   |
| ----------- | ------- | ------ |
| 250         | 11,260  | 0.89ms |
| 500         | 22,510  | 1.37ms |
| 1000        | 45,010  | 2.08ms |
| 2000        | 90,010  | 3.83ms |
| 4000        | 180,010 | 7.26ms |

16x input -> 8.2x time. Sub-linear. Categorically not the "accidentally quadratic" regression the
budget's own comment claimed to be guarding against.

### Step 4 — Check recent changes

`git log -L 254,268:packages/cli/tests/commands/scan-config.test.ts` returns exactly two commits:

- `56c277a65` (2026-04-01) `test(sentinel): add edge case and performance tests for scan-config` —
  introduced the test as a bare `expect(elapsed).toBeLessThan(100)`.
- `bfb350013` (2026-08-07) `test(orchestrator,cli): deflake test:coverage gauntlet under v8
coverage load (#1155)` — **raised** the budget to 2000ms under coverage, and added the
  `HARNESS_COVERAGE` plumbing to `packages/cli/vitest.config.mts` solely to serve it.

So the previous remediation of this exact assertion raised the number. It bought 13 months and one
red `main`.

### Step 5/6 — Trace the budget to the leg that actually runs it

`packages/cli/vitest.config.mts:11` sets `HARNESS_COVERAGE=1` only when argv contains `--coverage`,
i.e. only under `test:coverage`. `.github/workflows/ci.yml:102`:

```yaml
run: ${{ matrix.os == 'ubuntu-latest' && 'pnpm test:ci' || 'pnpm test -- --continue' }}
```

`test:ci` -> `turbo run test:coverage` -> `HARNESS_COVERAGE=1`, ubuntu only. Windows and macOS run
`pnpm test -- --continue`, uninstrumented, so `HARNESS_COVERAGE` is empty and `budgetMs` is 100.
The failing job log confirms it ran `pnpm test -- --continue`.

**The budget is inverted.** The relaxed 2000ms applied to the fast instrumented leg; the strict
100ms applied to the two slowest runners. Recorded as an Assumption-class finding, not acted on —
see Resolution.

## Uncertainty Surfacing

- **Assumption (stated, not verified locally):** the Windows runner's 113ms is load, not a
  Windows-specific slowness in `readFileSync`/`scanForInjection`. Supported by the leg's own
  numbers — the same job reports orchestrator `import 490.81s`, `tests 972.22s`, i.e. a heavily
  contended machine — and by the fact that the file's other 23 tests, which exercise the same
  code paths, all passed.
- **Deferrable:** seven sibling sites of this class remain (#2046). Out of scope for this item.
- **Deferrable:** the `ci.yml` budget inversion. Real, diagnosed, deliberately not fixed — fixing
  it would make the wall-clock assertion _work_, which is the remedy #2046 rules out.

## Hypotheses

### H1 (confirmed): the assertion is a function of runner load, and no threshold fixes that

Falsifiable prediction: if the assertion measured the code, a 112x local margin would not be lost
on CI. It was lost. Confirmed by the 0.89ms measurement above against the identical payload.

### H2 (confirmed): the removed assertion was weaker than it looked, and is replaceable by a deterministic one that is strictly stronger

The budget's stated intent was "the scan is fast, not accidentally quadratic". A wall-clock budget
cannot express either half honestly:

- It cannot assert the whole input was processed. A scan that silently truncates its input gets
  **faster** — i.e. **greener** under a timing budget.
- Its "not quadratic" claim is an inference from one data point at one input size.

Falsifiable prediction: a deterministic invariant exists that fails on both regressions the budget
would pass. Built and tested — an ~11KB clean body carrying ONE high-severity line placed **last**:

```js
expect(result.exitCode).toBe(2);
expect(result.results).toHaveLength(1);
expect(result.results[0]!.findings).toHaveLength(1);
expect(result.results[0]!.findings[0]!.line).toBe(lastLine); // 253
```

Measured ground truth for the shape (probe, not committed):
`bytes=11311 lastLine=253 exit=2 results=1 findings=1`, the single finding being
`{ ruleId: 'INJ-REROL-001', severity: 'high', line: 253 }`. Clean prefix alone: `exit=0 findings=0`.
And N offending lines -> exactly N findings for N in 1, 2, 5, 10, 20 (1:1, no duplication).

### H3 (confirmed): the replacement catches regressions the removed assertion does not

The mandatory revert protocol does not apply literally — this fix _removes_ an assertion, so there
is nothing to revert into a failure. The equivalent proof is mutation of the code under test. Two
mutations of `packages/cli/src/commands/scan-config.ts`, each applied, run, and reverted:

| Mutation                                                                                                     | New invariant                                                      | Old wall-clock assertion |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------ |
| `readFileSync(filePath, 'utf8').slice(0, 1000)` (scan a prefix)                                              | **FAIL** — `expected +0 to be 2`                                   | **PASS**, and faster     |
| `content.split('\n').flatMap(() => scanForInjection(content))` (per-line re-scan: quadratic work and output) | **FAIL** — `expected [ …(254) ] to have a length of 1 but got 254` | **PASS**                 |

Both mutants ship green past the assertion that was removed. Neither ships green past its
replacement. That is the evidence that this is a strengthening, not a deletion.

## Resolution

Resolved: 2026-09-09

**Root cause:** `scan-config.test.ts:266` asserted a wall-clock millisecond budget as the test's
_only_ assertion. On a shared CI runner that is a coin flip, not an assertion — the observed 113ms
came from a contended Windows runner, against a payload this host scans in 0.89ms. This is the
flake class tracked in **#2046**, whose standing policy is that raising the number is explicitly
**not** the fix: it lowers the failure rate without removing the nondeterminism, and it silently
weakens the only thing the assertion was for. A contributing structural fault — the
`HARNESS_COVERAGE`/`ci.yml` inversion that applied the _relaxed_ budget to the _fast_ leg — was
diagnosed and is documented, but deliberately left unfixed, because repairing it would make the
wall-clock assertion fire correctly rather than remove it.

**Fix:**

- `packages/cli/tests/commands/scan-config.test.ts` — the `Date.now()` timing, the `budgetMs`
  computation and the `expect(elapsed).toBeLessThan(budgetMs)` assertion are gone. The case is
  renamed `scans a large config file end to end, without false positives at scale` and asserts the
  deterministic invariant from H2. Test count unchanged at 24; nothing skipped, retried, or deleted.
- `packages/cli/vitest.config.mts` — the `COVERAGE` argv detection and the
  `env: { HARNESS_COVERAGE }` forwarding are removed. A repo-wide grep confirms the deleted
  `budgetMs` line was their only consumer in this package. Separate commit, so a reviewer who
  considers it out of scope can revert it alone. `packages/orchestrator/vitest.config.mts` keeps its
  independent copy of the pattern — it still has a live consumer
  (`tests/integration/telemetry-latency.test.ts`) and is untouched.

**Regression test:** `packages/cli/tests/commands/scan-config.test.ts` — the replacement assertion
_is_ the regression test, and its content is proven by the two mutations in H3 rather than by a
revert.

**Deferred, not silently dropped:** the benchmark-harness home for the runtime budget.
`scripts/benchmark-check.mjs` drives a hardcoded two-entry `PACKAGES` array (`core`, `graph`), each
with a `benchmarks/*.bench.ts` tree and a `bench` package script. `packages/cli` has neither.
Adding an entry means onboarding a third package to the harness _and_ introducing its first
filesystem-IO-bound benchmark — all eight existing baselines are pure-CPU microbenchmarks with
means of 0.0004–0.011ms, and the harness's `THRESHOLD = 1.0` is documented as calibrated for that
scale. Substantial new surface, so not built here; recorded as follow-up.

**Verification:** typecheck clean (`tsc --noEmit`, exit 0). Affected file 5/5 consecutive green
runs (`Test Files 1 passed`, `Tests 24 passed`). Full `packages/cli` suite
`Test Files 739 passed (739)`, `Tests 8731 passed | 2 skipped (8733)` — no regression.

**Learnings:**

- A wall-clock budget that a healthy machine clears by **112x** can still redden CI. Margin is not
  a defence against a load-dependent assertion; only removing the time dependence is.
- A timing budget is _weaker_ than it looks: a scan that reads less of its input runs faster, so a
  truncation regression makes a wall-clock test **greener**. Prefer an invariant that a lazier
  implementation cannot satisfy — here, the line number of a finding planted at the end of the file.
- When a millisecond assertion is relaxed "under coverage", check _which CI leg actually runs under
  coverage_. Here the relaxation landed on the fast instrumented leg while the strict number was
  left on the two slowest runners — the exact inverse of the intent, undetected for 13 months.
- When the fix is the removal of an assertion, the revert protocol has no literal form. Substitute
  mutation of the code under test: mutate, and show the new assertion fails where the old one
  passed. That is the only proof that a removal was a strengthening.
