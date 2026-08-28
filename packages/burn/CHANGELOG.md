# @harness-engineering/burn

## 0.3.0

### Minor Changes

- 43212b3: Add an invoking-skill attribution cut to burn so its breakdown reconciles with Claude
  Code's `/usage`. burn previously grouped subagent spend only by agent TYPE
  (`attributionAgent`), while `/usage` groups the same spend by the SKILL that spawned it
  (`harness:roadmap-fleet`, `harness:autopilot`, …), so the two views could never
  reconcile — `/usage` showed rows burn had no equivalent for. Each turn now also records
  `invokingSkill` (derived from the transcript's `attributionSkill`, already a
  fully-qualified `plugin:skill` value), the summary carries a `skills` block alongside
  `agents`, and `harness burn report` leads with a `by invoking skill` section that states
  its window (week-to-date vs `/usage`'s last-24h) so a mismatch reads as a different
  question, not a wrong number. Both cuts coexist and partition the same weekly total. A
  turn with no readable skill is grouped honestly as `unattributed-skill` (never dropped,
  never fabricated); legacy rows are `pre-migration`. The `usage.tsv` store widened from
  nine to ten columns with a `STORE_VERSION` bump that forces one re-derivation from
  transcripts on disk. burn's default window is unchanged.
- 18d3572: Join burn's per-lane/per-skill token attribution to shipped PRs — cost per merged PR (#1522). New `harness burn per-pr` reuses burn's existing transcript scan (per `agentId` lane and `agent` skill from #1270), reads the lane provenance files under `docs/changes/*/provenance.json`, and resolves each issue to its merged PR(s) via `gh`, then emits `{tokens_in, tokens_out, cache_read, prs_merged, cost_per_pr}` per lane and per skill into `.harness/metrics/cost-per-pr.json`. Both denominators — `cost_per_merged_pr` and `cost_per_dispatched_lane` — are carried side by side with a `denominator_note`, so the figure is never a silent success-only number. Raw tokens are the source-of-truth metric; a `$` figure is derived only when an adopter supplies an optional `cost_price_table` (default off, no hardcoded pricing). A `cost_bands` config enables a per-skill cost-regression check, the cost analogue of a performance budget. Missing linkage degrades to `unattributed` (never 0/free), matching #1270's discipline.
- ba9877f: Surface a dollar-cost figure on the budget/burn output (Refs #1525). When an adopter configures a burn `cost_price_table` (the per-model USD-per-token table #1522 already established), `buildSummary` now reconciles the current week's accrued token spend to USD and attaches an optional `cost` block (`usd_wtd`, `models_priced`, `models_total`) to the summary, and `harness fleet budget-check` renders/emits the spend, remaining, and envelope in `$` alongside the existing burn-units verdict (remaining/envelope derived from the week's observed `$`/unit rate). Tokens remain the source of truth; the `$` figure is derived only when a price table is configured — with no table the summary and command output are byte-identical. The token→USD arithmetic is reused via a single exported `priceRecord` helper (no second pricing mechanism), and there is no bundled provider pricing, keeping the primary number portable across model mixes. The cron scheduler (#1405) and dashboard-UI slices of #1525 remain deferred.

## 0.2.0

### Minor Changes

- c523902: feat(burn): attribute token spend to the subagent that spent it

  `UsageRecord` gains `agent` and `agentId`, `usage.tsv` widens from 7 to 9 columns
  (7-column rows still load, labelled `pre-migration`; the reader also tolerates any
  future extra columns), and `files.tsv` gains a `#version` header that forces one full
  rescan on upgrade — after which every row whose transcript is still on disk is
  relabelled with its real agent.

  `Summary` gains additive `agents` and `attribution` blocks, and `harness burn report`
  gains a "by agent" section in which the `unattributed` row is never elided. Subagent
  spend whose identity cannot be read is reported as `unattributed` units, never as zero;
  when none of the current week's subagent spend carries a readable label, the report
  headlines that attribution is degraded.

  Note for downgrades: a `burn` older than this change reading a 9-column store discards
  every row. The integrity gate then re-reads every transcript, so the loss is bounded to
  rows whose transcripts have already been pruned.

## 0.1.0

### Minor Changes

- d74f5ec: Ship the usage-burn HUD as `@harness-engineering/burn` + `harness burn`, replacing the
  standalone `claude-burn-hud` Python/shell tool.

  The HUD reports Claude Code usage pace from local transcripts: week-anchored spend,
  a baseline-shrunk forecast, per-model family limits, and a `/clear` nudge once the
  checked-out branch has merged. It is a local proxy, never Anthropic's real quota —
  `/usage` remains the authority, and no percentage is trustworthy until reconciled
  against it.

  Two surfaces, split on latency rather than taste:
  - `harness burn` (report, `weeks`, `calibrate`, `budget`, `reset-day`, `scan`,
    `install`) — human-invoked, so the CLI's module graph is affordable.
  - `harness-burn-hud` (`line`, `session-start`, `stop`, `scan`) — a standalone binary
    for the statusline repaint and the Stop hook. `harness --version` costs ~0.85s to
    load against a ~0.11s repaint budget, so this binary imports nothing from
    `@harness-engineering/*`; a test asserts that import graph, because the regression
    would show up only as a terminal that feels slow.

  Every regression test from the Python suite came across, each still tied to a defect
  that actually shipped: the Monday-UTC week assumption that understated a 97% week by
  ~81×, the write race that silently dropped 85% of the record store, transcript usage
  blocks inflating totals ~3.5×, and a 3-hour extrapolation firing CRITICAL. Parity was
  verified against 33,305 real records — every shared record byte-identical, and with
  `now` pinned the summaries differ only in float rendering.

  The port also fixed two hot-path defects of its own: the binary is emitted as `.mjs`
  so Node does not detect-and-reparse it on every launch, and `line` no longer blocks
  forever when run from a terminal.

  `harness burn install` performs the cutover into `~/.claude/settings.json` additively —
  it backs the file up, leaves unrelated hooks alone, and leaves the previous
  `~/.claude/hud` install on disk so there is a way back.
