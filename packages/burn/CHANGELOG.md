# @harness-engineering/burn

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
