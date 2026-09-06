# Session state: webhooks route-test fixed-sleep race remediation

**Fleet:** cicd-fleet · **Date:** 2026-09-05 · **Pipeline:** harness-debugging
**Branch:** `fix/webhooks-route-test-sleep-race` · **Base:** `origin/main` @ `c1ca02ba2`

## Trigger

CI run `33793262175`, job `100774716086` (`build-and-test (windows-latest, 22)`), main sha
`a1f74d76a`, 2026-09-03. Windows-only.

Job summary: `Test Files 1 failed | 256 passed | 3 skipped`, `Tests 1 failed | 2829 passed | 50 skipped`.

Failure: `FAIL src/server/routes/v1/webhooks.test.ts > handleV1WebhooksRoute > POST creates a
subscription and returns the secret once` — `SyntaxError: Unexpected end of JSON input` at
`webhooks.test.ts:72:23`.

Cause classification: **flake — fixed-timeout race**.

### Honesty note on the classification

There is **no same-SHA rerun evidence**. Every `ci.yml` run in this window is `attempt: 1`, so run
`33793262175` was never retried and there is no green re-run of `a1f74d76a` to point at. This item
is classified a flake by **failure mode** — a proven fixed-timeout race in a test whose 2829 sibling
tests passed in the same job — and by a deterministic local reproduction of the exact error, **not**
by a rerun flip. No rerun evidence is claimed.

## Phase log

- **INVESTIGATE** — Read `webhooks.ts` end to end. `handleV1WebhooksRoute` returns `true`
  synchronously (`webhooks.ts:81`) and completes the response inside `void (async () => {...})()`;
  every branch terminates in `sendJSON` -> `res.end`. The test's `chunks` array is filled only by
  the stubbed `res.write`/`res.end` in the local `makeRes()`. Established that the failing line
  reads `chunks` after a fixed 500ms wall-clock wait, so an unfinished handler yields
  `JSON.parse('')`.
  Counted the blast radius: `grep -c "setTimeout(r, 500)"` -> **20**. The whole file used a fixed
  sleep as its synchronization primitive; the Windows run merely lost the race at the first site.
- **INVESTIGATE (history)** — `git log` on the test file surfaced that this is the **third**
  recurrence: `b1747f6f2` (2026-05-15) bumped the same barrier 100ms -> 500ms across 21 sites one
  day after the tests landed, and `aafaa2d9f` (2026-05-18) converted the bus-event assertion to a
  ~2s poll for the same reason. Both raised the budget rather than removing it.
  `git log -S guardOutboundHost` surfaced `0876aec04` (2026-08-09), which put a **live DNS lookup**
  on the POST path — raising POST latency inside a budget calibrated in May against pure-fs work.
- **ANALYZE** — Working example located: the sibling `webhooks-url-guard.test.ts` stubs
  `node:dns/promises` with an in-memory table and states the reason in its header ("the route-level
  guard now RESOLVES the hostname, so the route tests below would otherwise depend on live DNS").
  `webhooks.test.ts` exercises the same handler with the same `https://example.com/hook` target and
  has no such stub. The difference between the working file and the failing file is exactly:
  the failing one resolves for real, inside a 500ms budget.
- **HYPOTHESIZE** — "The POST case fails because the handler has not reached `res.end` when the
  fixed 500ms elapses, so `chunks` is empty and `JSON.parse('')` throws. If correct, forcing the
  handler's async work past 500ms reproduces the exact error at the exact line."
  One variable changed: a temporary `vi.mock('node:dns/promises')` delaying 800ms.
  **Result — confirmed.** `Tests 1 failed | 18 passed`, same test name, same
  `SyntaxError: Unexpected end of JSON input`, same 1-of-19 shape as CI.
- **FIX** — `makeRes()` now also returns `whenEnded()`, resolving the instant the stubbed
  `res.end()` runs (the instant `chunks` is complete) and rejecting after `RESPONSE_END_TIMEOUT_MS`
  (10s) so a genuine hang fails loudly instead of hanging to the suite timeout. All 20 fixed sleeps
  and the one ~2s poll loop now await it. Applied as commit 1 of 2 and verified sufficient **on its
  own**, before the DNS stub existed.
- **FIX (second nondeterminism, separate commit)** — Stubbed `node:dns/promises` so the POST cases
  resolve offline, mirroring the sibling file. Kept as commit 2 of 2 so it can be reverted
  independently of the deflake.

## Regression-test verification protocol

The committed test file _is_ the regression guard; the proof is the fail-without-fix / pass-with-fix
pair, run against the identical 800ms slow-DNS scaffold:

| Scaffold        | Code state | Result                                                                         |
| --------------- | ---------- | ------------------------------------------------------------------------------ |
| 800ms DNS delay | pre-fix    | `1 failed \| 18 passed` — `SyntaxError: Unexpected end of JSON input`, line 72 |
| 800ms DNS delay | post-fix   | `19 passed`                                                                    |

The scaffold was a temporary file (`__repro.test.ts`), deleted after use. It is not in the diff.

Separately, the DNS stub was proven load-bearing rather than assumed: repointing its `example.com`
entry at `127.0.0.1` makes the SSRF guard block the POST with 422 and fails three cases, so the mock
genuinely intercepts.

## Repeated-run evidence

A single green is a flake's own signature, so the suite was run repeatedly. Node 22.23.2 (matching
CI's `windows-latest, 22` leg pin); `better-sqlite3` rebuilt from source under that pin.

| Run                                                  | Iterations | Result                                            |
| ---------------------------------------------------- | ---------- | ------------------------------------------------- |
| `webhooks.test.ts` alone, post-fix                   | 60         | **60 pass / 0 fail**                              |
| `webhooks.test.ts` under the 800ms slow-DNS scaffold | 1          | **pass** (pre-fix: fail)                          |
| Full `packages/orchestrator` suite, post-fix         | 15         | **14 pass / 1 fail** — see the anomaly note below |

Side effect worth recording: the affected file's wall time drops from **10.44s to ~0.16s**
(test time 10.30s -> ~0.03s), because its former runtime was almost entirely sleeping.

### Anomaly: one unattributed full-suite failure (disclosed, not swept up)

Full-suite run **2** reported `Test Files 1 failed | 259 passed | 1 skipped` /
`Tests 1 failed | 2882 passed`. **The identity of that failing file was not captured** — the run's
output was piped through `tail -8`, which kept the summary and discarded the failure block. That is
a data-collection mistake on my part, and it is recorded here rather than quietly dropped.

What can be said about it honestly:

- It did **not** recur in any of the other 14 full-suite runs.
- `webhooks.test.ts` passed in every other full-suite run and 60/60 standalone. After this change it
  has no wall-clock budget and no network dependency left, so the only way it can now fail on timing
  is the 10s hang bound — 20x the budget that was being missed, against a handler that no longer
  resolves DNS.
- Two sibling files in this package still synchronize on fixed sleeps and are the natural suspects:
  `src/server/webhooks-integration.test.ts` (a 200ms sleep behind a test literally named "DELETE
  stops further fan-out **within 100ms**") and `src/gateway/webhooks/delivery.test.ts` (six sleeps
  of 100-300ms). Both were hammered 25 times each in a targeted loop under load: 25 pass / 0 fail, no reproduction.

I am **not** claiming this was one of those files. I am claiming it was not reproduced, that the
evidence does not implicate the file this PR changes, and that the log needed to settle it was lost.

## Autonomous decisions taken

- **D1** — Fixed all 20 sleep sites plus the 1 poll loop, not only the site that failed. Leaving 19
  latent races behind is not a deflake.
- **D2** — Did **not** lengthen the sleep. The file's own history shows that remedy applied twice
  already; a longer sleep is a rarer race, not a fixed one.
- **D3** — Included the DNS stub, in a **separate commit**, as a second and distinct nondeterminism
  (live network in a unit test; hard 422 on a runner that cannot resolve). Reviewer can drop it with
  one revert.
- **D4** — Set `RESPONSE_END_TIMEOUT_MS` generously (10s). It is a hang detector, not a settle
  delay; a tight value would reintroduce the budget being removed.
- **D5** — No tracking issue filed. The item is net-new with no existing tracker entry, and filing
  was reserved to the dispatcher. No `Closes #` reference is used.

## Reported, not fixed

`packages/orchestrator/src/server/routes/v1/webhooks-url-guard.test.ts` drives the same handler
through six route cases that each `await new Promise((r) => setTimeout(r, 20))`. That is the same
fixed-sleep race with a 25x smaller budget, surviving only because that file stubs DNS and so keeps
the handler fast. It is outside this item's file ownership and did not fail in CI, so it is reported
for routing rather than edited here. The `whenEnded()` helper added by this change is the ready-made
remedy.

## Verification

- `grep -c 'setTimeout(r, 500)' webhooks.test.ts` -> `0`
- 21 `await ...Ended()` barrier sites (20 former sleeps + 1 former poll loop)
- Test count unchanged at 19; no skip, no retry, no deleted test, no weakened assertion
- `tsc --noEmit -p packages/orchestrator/tsconfig.json` -> clean
- `pnpm run check:changesets` -> exit 0 (test-only change, no publishable surface)
- Full orchestrator suite green, 3/3

## Status

`resolved` — session record at `.harness/debug/active/webhooks-route-test-sleep-race.md`
(gitignored path; mirrored here because `.harness/debug/` is excluded by `.gitignore`).
