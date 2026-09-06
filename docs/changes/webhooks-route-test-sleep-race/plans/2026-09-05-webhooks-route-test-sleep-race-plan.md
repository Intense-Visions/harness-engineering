# Plan: remove the fixed-sleep race from the webhooks route tests

**Date:** 2026-09-05 · **Trigger:** CI run `33793262175`, job `100774716086` (`build-and-test (windows-latest, 22)`), main sha `a1f74d76a` · **Tasks:** 4 · **Time:** ~40 min · **Integration Tier:** small

Remediation for the single test failure in an otherwise-green Windows leg. The job reported
`Test Files 1 failed | 256 passed | 3 skipped` and `Tests 1 failed | 2829 passed | 50 skipped`.

## Goal

Make `packages/orchestrator/src/server/routes/v1/webhooks.test.ts` synchronize on the handler's
actual completion signal rather than on a fixed wall-clock budget, so the file has no timing
budget left to lose on a slow runner.

## Root cause

`handleV1WebhooksRoute` (`packages/orchestrator/src/server/routes/v1/webhooks.ts:81`) returns
`true` **synchronously** and performs its real work inside `void (async () => { ... })()`. The
response is completed later, on that async chain, by `sendJSON` -> `res.end(...)`.

Every test in the file used a fixed sleep as its barrier and then read the captured body:

```
70|     await new Promise((r) => setTimeout(r, 500));
71|     expect(statusCode()).toBe(200);
72|     const body = JSON.parse(chunks.join('')) as { id: string; secret: ... };
```

`chunks` is filled by the stubbed `res.write`/`res.end` in the local `makeRes()` helper. When the
handler has not reached `res.end` within 500ms, `chunks` is empty, `chunks.join('')` is `''`, and
`JSON.parse('')` throws `SyntaxError: Unexpected end of JSON input` at
`webhooks.test.ts:72:23` — the exact CI failure.

This is a **timing race**, not a serialization or file-IO bug. Two independent factors made the
Windows leg the one to lose it:

1. **Runner contention.** That job's orchestrator suite reported
   `Duration 502.19s (transform 120.55s, import 427.52s, tests 863.27s)`. Windows is by far the
   slowest leg; a 500ms budget is not generous there.
2. **A live DNS lookup on the POST path.** `0876aec04` added `guardOutboundHost` to the POST
   handler (`webhooks.ts:150`), which calls `dns.lookup()` on the target hostname. The POST cases
   here target `https://example.com/hook`, so each one performed a **real network resolution**
   inside the 500ms budget. The sibling `webhooks-url-guard.test.ts` stubs `node:dns/promises` for
   exactly this reason, with the rationale written out in its header; `webhooks.test.ts` was missed
   when the guard landed.

### This has recurred twice before

| Date       | Commit            | What was done                                                                                                              |
| ---------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-14 | `b268da1b6`       | Tests land using fixed 100ms sleeps as the barrier.                                                                        |
| 2026-05-15 | `b1747f6f2`       | `fix(test): bump post-handler settle timeout 100ms -> 500ms` — 21 sites.                                                   |
| 2026-05-18 | `aafaa2d9f`       | Bus-event assertion converted to a ~2s poll, "so coverage-instrumented runs don't flake on the original fixed 500ms wait". |
| 2026-08-09 | `0876aec04`       | DNS resolution added to the POST path, raising its latency; no stub added to this file.                                    |
| 2026-09-03 | run `33793262175` | Windows CI loses the race at the first POST case.                                                                          |

Each prior remediation **raised the budget** instead of removing it. A longer sleep is a rarer
race, not a fixed one. That is why this plan removes the budget entirely rather than raising it a
third time.

## Reproduction

The race does not reproduce on this machine unaided — local runs are fast enough to win it, which
is precisely why "it passes locally" is worthless evidence here. A deterministic scaffold was used
instead: a temporary `vi.mock('node:dns/promises')` returning after 800ms, modelling a loaded
runner whose resolution exceeds the 500ms budget.

- **Pre-fix + 800ms DNS:** `Tests 1 failed | 18 passed`, `FAIL ... > POST creates a subscription and returns the secret once`, `SyntaxError: Unexpected end of JSON input`. Identical test, identical error, identical 1-of-19 shape as CI.
- **Post-fix + 800ms DNS:** `Tests 19 passed`.

The scaffold was deleted after use; it is not in the diff.

## Observable Truths (Acceptance Criteria)

1. No fixed-duration settle sleep remains in the file.
   **Gate:** `grep -c 'setTimeout(r, 500)' webhooks.test.ts` -> `0`; the only surviving
   `setTimeout(` is the hang-detection timer inside `makeRes()`.
2. All 20 sleep sites plus the one ~2s poll loop await the response's own end signal.
   **Gate:** 21 `await ...Ended()` / `await whenEnded()` call sites.
3. A handler that never responds still fails loudly, not by hanging to the suite timeout.
   **Gate:** `whenEnded()` rejects after `RESPONSE_END_TIMEOUT_MS` with a named error.
4. No test is skipped, deleted, retried, or weakened; the assertion set is unchanged.
   **Gate:** test count stays 19; `git diff` touches only `makeRes()`, the barrier lines, and the
   added DNS stub.
5. The suite is deterministic across repeated local runs.
   **Gate:** 60 consecutive green iterations of the affected file, plus 15 full-package runs (14 green; the single failure is a separate, unattributed file -- disclosed in the session state).

## Tasks

1. Give `makeRes()` a `whenEnded()` promise that settles when the stubbed `res.end()` fires, with a
   bounded rejection so a genuine hang is loud.
2. Replace all 20 fixed sleeps and the one poll loop with `await whenEnded()`.
3. Stub `node:dns/promises` so the POST cases resolve offline (separate commit — see tradeoffs).
4. Write the plan and session-state artifacts (this file and its sibling under `sessions/`).

## Assumptions and tradeoffs

- **Autonomous decision — the DNS stub is included, in its own commit.** The completion-signal fix
  alone is sufficient for the reported flake, and was verified sufficient in isolation against the
  800ms scaffold before the stub existed. The stub was added because the live lookup is a second,
  distinct nondeterminism in the same file: on a runner that cannot resolve `example.com` the guard
  fails closed and the POST cases return 422, a hard red no amount of awaiting prevents. It is kept
  as commit 2 of 2 so a reviewer who considers it out of scope can drop it with a single revert
  without touching the deflake.
- **Verified load-bearing, not assumed.** Pointing the stub's `example.com` entry at `127.0.0.1`
  makes the SSRF guard block the POST with 422 and fails three cases, proving the mock intercepts
  rather than falling through to the real resolver.
- **`RESPONSE_END_TIMEOUT_MS` is 10s.** It is not a settle delay — nothing waits on it when the
  handler responds. It is set generously on purpose: a slow runner must never reach it, so it can
  only ever mean a genuine hang. Choosing it tight would reintroduce the very budget being removed.
- **Assumption:** every route branch reachable from these 19 cases terminates in `sendJSON`, hence
  in `res.end`. Verified by reading `webhooks.ts` end to end — all four branches (queue stats, GET
  list, POST create, DELETE) call `sendJSON` on every path, including every error path. No site was
  left sleeping for want of a signal.
- **Classified a flake by failure MODE, not by a rerun flip.** Every `ci.yml` run in this window is
  `attempt: 1`; run `33793262175` was never retried, so there is no same-SHA green to point at. The
  classification rests on the mechanism being a proven fixed-timeout race, on the deterministic
  scaffold reproducing the exact error, and on the other 2829 tests in the job passing.
- **Not fixed here, reported instead:** the sibling `webhooks-url-guard.test.ts` exercises the same
  handler through six route cases that each sleep a fixed **20ms**. Those are the same latent race
  with a 25x smaller budget. That file was outside this item's ownership and did not fail, so it is
  reported for routing rather than edited.
