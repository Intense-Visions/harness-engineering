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

### Dollars are derived, never the source of truth

Units are portable across model mixes and are the metric everything is enforced in. A
**dollar** figure is derived _only_ when an adopter configures a `cost_price_table` (per-model
USD per token — the same table the cost-per-PR report uses; there is no bundled provider
pricing). When set, `buildSummary` reconciles the current week's spend to USD via `priceRecord`
and attaches a `cost` block (`usd_wtd`, `models_priced`, `models_total`) to the summary — omitted
entirely otherwise, so the summary stays byte-identical for adopters who price nothing. That
block is what lets `harness fleet budget-check` render the spend envelope in `$` alongside units
(Refs #1525). `models_priced < models_total` marks an undercount when a model has no table entry.

## Attribution

Every deduped turn carries the identity of whoever spent it, so the week can be read
by agent and not only by model.

| Label           | What it means                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `main`          | Your own thread. Carries no lane id, so it reports zero lanes.                                               |
| `<agent type>`  | A dispatched subagent, named by its `attributionAgent` (e.g. `harness-task-executor`).                       |
| `unattributed`  | **Subagent** spend whose identity could not be read. Counted, never dropped, never folded into `main`.       |
| `pre-migration` | A row written before this feature existed. Provenance unknown; upgraded to a real label on the first rescan. |

`unattributed` is a real bucket, not an error state. A subagent's identity fields are
undocumented Claude Code internals, so a Claude Code release can stop them being
readable at any time — and a CLI update must not be able to report a fleet run as free.
When subagent spend exists in the current week and _none_ of it carries a readable
label, the summary sets `attribution.degraded` and the report says so in a headline:
"no fleet ran" and "the scanner stopped working" are indistinguishable from the numbers
alone. In the report the `unattributed` row is exempt from the top-N cut and the unit
floor that elide other labels — a bucket that can vanish cannot do its job.

The degradation flag detects labels that went **missing**, not labels that are **wrong**.
Classification trusts `attributionAgent` unconditionally: a line carrying one is filed under
that agent whether or not anything else marks it as subagent spend. That holds because
main-thread turns are not observed to carry the field — they carry `attributionSkill` /
`attributionPlugin` / `attributionMcpServer` instead — but that is an observation about
undocumented internals, not a contract. If a Claude Code release began stamping
`attributionAgent` on main-thread turns, that spend would be silently reattributed: `main`
would shrink, a lane-less agent bucket would grow, and `attribution.degraded` would stay
false throughout. This gap is accepted rather than guarded, because requiring a
corroborating signal before believing a label would suppress real attribution the moment
either of the other two signals moved — trading a plausible failure for a likelier one. The
symptom to watch for is a `main` bucket that collapses without a matching rise in lane
counts.

`pre-migration` is deliberately its own label rather than a shade of `unattributed`.
Most legacy rows are main-thread spend, so calling them unattributed would be a false
claim about history _and_ would fire the degradation alarm on the first upgraded scan.
They are excluded from the degradation test in both directions: they cannot raise it,
and they cannot suppress it.

A `lane` is one dispatch, counted as a distinct `agentId`. `attribution.lanes` is the
union across labels, so a lane seen under two labels mid-migration counts once — it is
not the sum of the per-label counts. Attribution is **retrospective**: it reads
transcripts a subagent has already written, so it can measure spend but can never
reserve it before a dispatch happens.

A `burn` older than this change reading a 9-column store discards every row. That is
accepted rather than mitigated: the integrity gate then re-reads every transcript, and
this store is a rolling local cache reconstructible from source, not a system of record.

### By invoking skill — reconciling with `/usage`

The table above cuts the week by agent **type** (`attributionAgent`). Claude Code's own
`/usage` cuts the _same_ spend by the **skill** that spawned the subagent — it shows a
`harness:roadmap-fleet` row where the agent cut shows `general-purpose` and named harness
agents. Both are honest; they are different questions, so cross-checking one against the
other makes a correct number look broken. burn therefore carries **both** cuts.

Every turn also records `invokingSkill`, derived from the transcript's `attributionSkill`
(already carried per subagent turn, already a fully-qualified `plugin:skill` value like
`harness:autopilot` — the exact shape `/usage` reports). The report leads with this cut,
under `by invoking skill`, because it is the one that reconciles against `/usage`.

| Skill label          | What it means                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `<plugin:skill>`     | The skill that spawned the turn, e.g. `harness:autopilot`. Reconciles directly with a `/usage` row.                                          |
| `unattributed-skill` | A turn carrying no readable skill (main-thread work, or a subagent whose skill could not be read). Counted, never dropped, never fabricated. |
| `pre-migration`      | A row written before this column existed; provenance unknown, re-derived on the first rescan.                                                |

The skill cut partitions the week identically to the agent cut — both sum to the same
weekly total — which is what makes the two views reconcile rather than compete. It has no
separate degradation flag: the agent-type `attribution.degraded` already headlines a
broken scanner, and a missing skill degrades visibly to `unattributed-skill`.

**The windows still differ.** `/usage` reports the last 24h; burn reports week-to-date.
The report states its window next to the skill cut so a mismatch reads as "a different
span", not "a wrong number". Reconcile like for like; the default window is unchanged.

The store widened from nine to ten columns to carry `invokingSkill`, with a `STORE_VERSION`
bump that forces one full rescan so existing rows are re-derived from the transcripts
still on disk rather than pinned to `pre-migration`.

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

| Group            | Guards against                                                                 |
| ---------------- | ------------------------------------------------------------------------------ |
| week anchor      | the Monday-UTC assumption that understated a 97% week by ~81×                  |
| data loss        | the write race that silently dropped 85% of the record store                   |
| dedupe           | repeated usage blocks inflating every figure ~3.5×                             |
| abstention       | a zero or thin denominator reading as a pass                                   |
| concurrency      | partial rows and header/store disagreement under parallel scans                |
| budgets & models | a spent per-family limit hiding behind a healthy pooled bar                    |
| attribution      | subagent spend reading as zero, or collapsing into the main thread             |
| migration        | a store widening discarding every legacy row, or pinning it to the wrong label |
| bin startup      | the CLI module graph creeping onto the statusline hot path                     |

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
