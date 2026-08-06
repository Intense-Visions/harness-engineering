# @harness-engineering/burn

Usage-burn HUD for Claude Code: a transcript scanner, a week-anchored rollup, and a
dependency-free statusline renderer.

TypeScript port of the standalone `claude-burn-hud` (Python + shell). The behaviour,
the on-disk formats and the failure-mode discipline are carried over unchanged; see
[Porting notes](#porting-notes) for the three places the runtime forced a real change.

## The one thing to know

**This does not know your real weekly limit.** Anthropic enforces that server-side, and
nothing on this machine caches remaining quota. So this package never prints a
"% of your weekly limit" on its own authority — that number would be fabricated
precision, and a confident-but-invented gauge is worse than no gauge.

What it reports is measured:

- **actual consumption**, parsed from `~/.claude/projects/**/*.jsonl` and deduped by
  `requestId` (transcripts repeat each usage block ~3×, so naive counting inflates
  totals ~3.5×)
- **pace vs your own trailing baseline** (median of the last 4 complete weeks)
- **pace vs a budget you set**, once calibrated against a real `/usage` reading

For real quota status, run `/usage`. That is the authority; this is a proxy.

## Surfaces

| Surface                                                  | Where it lives       | Why                                                                |
| -------------------------------------------------------- | -------------------- | ------------------------------------------------------------------ |
| `harness burn …`                                         | `packages/cli`       | Interactive: report, weeks, calibrate, budget, reset-day, install. |
| `harness-burn-hud line \| session-start \| stop \| scan` | this package's `bin` | Hot paths. Standalone, zero `@harness-engineering/*` imports.      |
| `buildSummary`, `scan`, `renderStatusline`, …            | this package's `src` | The library both of the above call.                                |

### Why two binaries

`harness --version` costs **~0.85s** to load the CLI's module graph. The statusline
repaints on every prompt against a **~0.11s** budget, and the Stop hook fires after every
assistant turn. So the hot paths ship as a separate bundled binary that imports only Node
builtins. `tests/bin-startup.test.ts` asserts that import graph — a single stray
`@harness-engineering/*` import would make the statusline ~8× more expensive with no
symptom beyond a terminal that feels sluggish.

## Units

A weighted proxy for cost/limit pressure, using Opus-like price ratios:

```
units = output×5 + input×1 + cache_write×1.25 + cache_read×0.1
```

Cache reads dominate raw token counts but are nearly free, which is why raw tokens are a
misleading headline and this weighting exists.

## Design rules

These come from the "check the denominator" habit: a green readout must never be
reachable by a path that did not actually measure anything.

- **A zero denominator is an abstention, not a pass.** No usage records → `NO_DATA`
  ("blind, not clear"), never `0% — you're fine`.
- **A thin sample cannot produce a confident all-clear.** Under ~1 day elapsed, a
  full-week forecast is noise, so a would-be `OK` is downgraded to `EARLY`. Elevated
  statuses are _not_ suppressed — spend already incurred is real regardless of forecast
  confidence, and that asymmetry is deliberate.
- **Actual spend leads; a forecast is always marked as one.** `N% of budget` is banned
  outright — it names the budget without saying whether that is spent or predicted.
- **A forecast may only escalate on the evidence behind it.** Otherwise 2% of budget spent
  in three hours extrapolates to 118% and cries `CRITICAL`, which teaches you to ignore
  the alarm that matters.
- **Silently-degraded tooling is a headline alert.** A stale or unreadable cache is
  reported in the statusline, the session brief and the CLI — never swallowed.

## The week window is load-bearing

The first version assumed a Monday-midnight-UTC week. The real reset was **Wednesday
08:59 America/Chicago**. That mismatch reported **3.4M units and a calm `EARLY` while the
account was at 97% of its actual weekly limit** — an ~81× understatement.

The denominator was fine and the data was real; the tool was measuring _the wrong seven
days_. No amount of zero-denominator checking catches a correct computation over a wrong
window — only reconciling against `/usage` does. After changing `week_reset`, always
re-run `harness burn calibrate`.

## Tests

```bash
pnpm --filter @harness-engineering/burn test
```

Every test in `scan.test.ts`, `statusline.test.ts`, `budgets-models.test.ts` and
`concurrency.test.ts` corresponds to a defect that actually shipped:

| Group            | Guards against                                                  |
| ---------------- | --------------------------------------------------------------- |
| week anchor      | the Monday-UTC assumption that understated a 97% week by ~81×   |
| data loss        | the write race that silently dropped 85% of the record store    |
| dedupe           | repeated usage blocks inflating every figure ~3.5×              |
| abstention       | a zero or thin denominator reading as a pass                    |
| concurrency      | partial rows and header/store disagreement under parallel scans |
| budgets & models | a spent per-family limit hiding behind a healthy pooled bar     |
| bin startup      | the CLI module graph creeping onto the statusline hot path      |

Locking and atomic writes are exercised in real subprocesses, since neither means
anything within a single process.

## Porting notes

Three places where the runtime, not the design, forced a change:

1. **Locking.** Python used `fcntl.flock`, which the kernel releases when the holder
   dies. Node has no `flock`, so `store.ts` uses an atomic `mkdir` plus a staleness
   reclaim (dead pid, or older than a scan could plausibly take). Two tests cover what
   the kernel used to do for free.
2. **Timezones.** `zoneinfo` → `Intl.DateTimeFormat`, with a two-pass offset resolution
   so a reset near a DST boundary lands on the right side of the shift. Asserted across
   the 2026-11-01 US transition.
3. **Timestamps.** Summaries are written as `…+00:00` rather than Node's default `…Z`,
   because `datetime.fromisoformat` rejected `Z` before Python 3.11 and the old HUD may
   still be reading these files during cutover.

Parity was verified by running both implementations over the same 33,305 real records:
every shared record was byte-identical, and with `now` pinned the summaries differed only
in Python's microsecond vs JS millisecond precision and `100.0` vs `100` JSON rendering.

## Known blind spots

State these rather than let a confident number imply otherwise:

- **This machine only.** `/usage` notes its own breakdown excludes other devices and
  claude.ai, so local units undercount account usage if you work across two machines.
  Calibration absorbs the other device's share while the device mix holds, and drifts
  when it changes.
- **Units are a fixed weighting**, not a live price feed. A large shift in workload mix
  drifts the mapping — observed 1.9× in two days. Treat a calibration as good for days,
  not weeks.
- **The 5-hour session window is a trailing approximation** of an anchored server-side
  window, so treat it as directional.
- **Weekly limits can be per-model.** The pooled bar and a family bar are different
  limits; `model_budgets` is how the HUD knows about the latter.
