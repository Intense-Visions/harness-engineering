# Plan: remove the wall-clock budget from the scan-config large-file test

**Date:** 2026-09-09 · **Trigger:** CI run `34303979771`, job `build-and-test (windows-latest, 22)`, main sha `164c704cd` · **Tasks:** 4 · **Time:** ~40 min · **Integration Tier:** small

Remediation for the single test failure in an otherwise-green Windows leg. The job reported
`Test Files 1 failed | 733 passed | 5 skipped (739)`; the file itself reported
`tests/commands/scan-config.test.ts (24 tests | 1 failed) 914ms`.

## Goal

Leave `packages/cli/tests/commands/scan-config.test.ts` with no wall-clock budget to lose, while
preserving — and strengthening — what the removed assertion was actually for.

## Root cause

`packages/cli/tests/commands/scan-config.test.ts:252` asserted a millisecond budget and nothing
else. The wall-clock assertion was the test's **only** assertion:

```js
it('scans large config files within 100ms', async () => {
  const content = '# Config\n\n' + 'This is a normal line of configuration text.\n'.repeat(250);
  fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), content);
  const start = Date.now();
  await runScanConfig(tempDir, {});
  const elapsed = Date.now() - start;
  const budgetMs = process.env['HARNESS_COVERAGE'] === '1' ? 2000 : 100;
  expect(elapsed).toBeLessThan(budgetMs); // <- line 266, the CI failure
});
```

CI failure, verbatim from the job log:

```
FAIL tests/commands/scan-config.test.ts > runScanConfig > edge cases > scans large config files within 100ms
AssertionError: expected 113 to be less than 100
 ❯ tests/commands/scan-config.test.ts:266:23
```

Nothing about the code under test changed — the run is a `chore: version packages (#2108)` push.
The assertion is a function of runner load, so it fails without any state being shared or any
resource colliding. This is the flake class tracked in **#2046**.

**The margin was never the problem.** Measured on this dev host against the exact payload
(11,260 bytes, 253 lines), `runScanConfig` means **0.89ms** — 112x under the 100ms budget. A
112x margin still lost on a shared Windows runner. No budget number survives that; only removing
the budget does.

Measured scaling on the same host confirms the code is not the suspect:

| clean lines | bytes   | mean   |
| ----------- | ------- | ------ |
| 250         | 11,260  | 0.89ms |
| 500         | 22,510  | 1.37ms |
| 1000        | 45,010  | 2.08ms |
| 2000        | 90,010  | 3.83ms |
| 4000        | 180,010 | 7.26ms |

16x the input for 8.2x the time — sub-linear, categorically not quadratic.

### This has recurred once before, and the prior remediation raised the number

| Date       | Commit            | What was done                                                                                                                                                                  |
| ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-01 | `56c277a65`       | Test lands as `expect(elapsed).toBeLessThan(100)` — a bare budget, the file's only assertion.                                                                                  |
| 2026-08-07 | `bfb350013`       | `test(...): deflake test:coverage gauntlet` — budget made coverage-aware, 100ms -> 2000ms under `HARNESS_COVERAGE`. New `vitest.config.mts` plumbing added solely to serve it. |
| 2026-09-06 | issue #2046 filed | Standing policy recorded: "Raising the millisecond numbers is explicitly not the fix."                                                                                         |
| 2026-09-09 | run `34303979771` | Windows CI loses the budget at 113ms and takes `main` red.                                                                                                                     |

The 2026-08 remediation raised the budget on the _instrumented_ leg. That is the wrong leg —
see the inversion below — and per #2046 it was the wrong shape of fix regardless.

### The `HARNESS_COVERAGE` budget inversion (diagnosed, deliberately NOT fixed here)

`.github/workflows/ci.yml:102` runs

```yaml
run: ${{ matrix.os == 'ubuntu-latest' && 'pnpm test:ci' || 'pnpm test -- --continue' }}
```

`test:ci` is `turbo run test:coverage`, which is the only path that sets `HARNESS_COVERAGE=1`
(forwarded by `packages/cli/vitest.config.mts`). So the **relaxed 2000ms** budget applied only to
the fast instrumented **ubuntu** leg, and the **strict 100ms** budget applied to **windows and
macOS** — the two slowest runners, which run uninstrumented. The job log confirms it: the failing
Windows leg ran `pnpm test -- --continue`, so `HARNESS_COVERAGE` was empty and the budget was 100.

The inversion is real. It is **deliberately not fixed in this PR.** Correcting the inversion would
make the budget fire on the right leg — i.e. it would make the wall-clock assertion _work better_ —
which is precisely the remedy #2046 rules out. Removing the assertion makes the inversion moot at
this site. It is recorded here so a reader does not rediscover it as an oversight.

## Reproduction

The fault does not reproduce on this host unaided; local runs win the race by 112x, which is
exactly why "it passes locally" is worthless evidence for this class. Per the
`windows-ephemeral-port-deflake` precedent, the evidence standard for this item is therefore: the
wall-clock assertion is **gone**, the replacement assertion **has content** (proven by mutation),
and the suite is stable across repeated runs — not "the Windows timing was reproduced locally."

## Observable Truths (Acceptance Criteria)

1. No wall-clock timing remains in the file.
   **Gate:** `grep -E 'Date\.now|toBeLessThan|budgetMs' scan-config.test.ts` matches nothing
   outside comments; the `HARNESS_COVERAGE` read is gone.
2. The test is renamed to describe what it now asserts, and no longer claims a millisecond budget.
   **Gate:** the title `scans large config files within 100ms` no longer exists.
3. The replacement assertion is deterministic and strictly stronger than the one removed.
   **Gate:** two source mutations (below) make the new assertion FAIL while the old wall-clock
   assertion still PASSES.
4. No test is skipped, deleted, retried, or weakened.
   **Gate:** the file's test count stays 24; the diff touches only this one `it(...)` block.
5. The file is deterministic across repeated local runs.
   **Gate:** 5 consecutive green runs of the affected file, plus a full-package run.

## The replacement invariant

Per #2046 — "Where an in-test guard is genuinely wanted, assert a deterministic invariant
(operation count, complexity, cache-hit vs cache-miss ratio) rather than milliseconds."

An ~11KB body of clean prose (250 identical lines) carries ONE high-severity line placed **last**:

- `exitCode === 2` and `findings[0].line === 253` (the final line) proves the **whole file was
  scanned, not a prefix**. This is the half a wall-clock budget can never assert: a scan that
  silently truncates its input gets _faster_, i.e. greener, under a timing budget.
- `findings` has length **exactly 1** proves the 250 clean lines produce **no false positives at
  scale**, and that no rule re-matches the document per line — the accidentally-quadratic shape
  the removed comment named, which would yield one finding per line here.

Measured behaviour backing both claims (probe, not committed): the clean 250-line payload scans
to `exit 0, 1 result, 0 findings, severity 'clean'`; N offending lines produce exactly N findings
for N in 1, 2, 5, 10, 20 — 1:1, no duplication.

### Mutation evidence (the revert protocol, adapted)

The fix here _removes_ an assertion, so "revert the fix, watch the test fail" does not apply
literally. The equivalent proof is that the replacement catches regressions the removed assertion
did not. Two mutations were applied to `packages/cli/src/commands/scan-config.ts`, run, and
reverted:

| Mutation                                                                                                        | New invariant                                                      | Old wall-clock assertion |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| `readFileSync(...).slice(0, 1000)` — scan only a prefix of the input                                            | **FAIL** — `expected +0 to be 2`                                   | **PASS** (and faster)    |
| `content.split('\n').flatMap(() => scanForInjection(content))` — per-line re-scan (quadratic work _and_ output) | **FAIL** — `expected [ …(254) ] to have a length of 1 but got 254` | **PASS**                 |

Both mutants ship green past the assertion that was removed. Neither ships green past the one that
replaced it.

## Tasks

1. Replace the `it('scans large config files within 100ms')` body with the deterministic
   end-to-end invariant and rename the case.
2. Remove the now-dead `HARNESS_COVERAGE` plumbing from `packages/cli/vitest.config.mts`
   (separate commit — see tradeoffs).
3. Add a patch changeset.
4. Write the plan, debug-session, and provenance artifacts (this file and its siblings).

## Assumptions and tradeoffs

- **Implemented the human's decision verbatim (option (a)):** delete the wall-clock assertion,
  honour #2046's stated policy, no amendment to #2046. The budget was **not** widened, the test
  was **not** skipped, retried, or deleted, and the `ci.yml` inversion was **not** fixed.
- **Autonomous decision — the replacement invariant is stronger than the brief's suggested
  default, and the difference is deliberate.** The brief offered "10KB of clean config yields zero
  findings and exit code 0". That is deterministic and honest, but it is **satisfied by a scanner
  that reads nothing at all** — zero findings is the same answer for a correct scan and for a
  no-op. Appending one high-severity line as the final line and asserting its line number keeps the
  false-positive-at-scale property (exactly one finding means the 250 clean lines produced none)
  while adding a property that cannot be faked by doing less work. Mutation 1 above is the proof:
  the weaker form would have passed it.
- **Autonomous decision — the dead `HARNESS_COVERAGE` plumbing in
  `packages/cli/vitest.config.mts` is removed, in its own commit.** A repo-wide grep confirms this
  test's `budgetMs` line was its **only** consumer in `packages/cli`; the config's own comment names
  it ("Consumed by scan-config's coverage-aware perf budget"). Leaving the block would leave a
  comment that names a consumer that no longer exists, and would leave standing the exact
  mechanism #2046 exists to remove. `packages/orchestrator/vitest.config.mts` has an independent
  copy of the same pattern with its own live consumer (`telemetry-latency.test.ts`); that one is
  untouched. Kept as a separate commit so a reviewer who considers it out of scope can drop it with
  a single revert without touching the deflake.
- **Not fixed here, reported instead — the benchmark-harness entry is DEFERRED.** #2046 says to
  "move any genuinely-wanted performance budget to the benchmark harness this repo already runs".
  Inspected: `scripts/benchmark-check.mjs` drives a **hardcoded two-entry** `PACKAGES` array
  (`core`, `graph`), each of which has a `benchmarks/*.bench.ts` tree and a `bench` package script.
  `packages/cli` has **neither**. Adding a scan-config entry would require onboarding a third
  package to the harness (new `benchmarks/` tree, new `bench` script, a third `PACKAGES` entry, a
  regenerated `benchmark-baselines.json`) **and** would make it the harness's first
  filesystem-IO-bound benchmark: every one of the eight existing baselines is a pure-CPU
  microbenchmark with a mean in the 0.0004–0.011ms range, and the harness's `THRESHOLD = 1.0`
  (100%) noise tolerance is documented as calibrated for exactly that microsecond scale. That is a
  substantial new surface, not a clean additive entry, so it is **not built here** per the item's
  own instruction. Recorded as follow-up. Note the runtime budget is not "lost" in any load-bearing
  sense: it was never enforced on a leg where it could hold, and the local scaling table above is
  the evidence that the scan is linear.
- **Scope is this one site.** The seven sibling sites listed in #2046 are untouched. Note that
  `scan-config.test.ts:266` is **not** one of the seven in that issue's table (which was taken at
  `db9c6739d`) — it is an eighth instance of the same class, and the second in it to redden `main`.
  #2046 stays open; this PR references it rather than closing it.
- **Classified a flake by failure MODE, not by a rerun flip.** There is no same-SHA green to point
  at. The classification rests on the assertion being a pure function of runner load, on the
  113-vs-100 margin against a measured 0.89ms local mean, and on the other 733 test files in the
  job passing.
