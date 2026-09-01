---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(rate-distortion): report-only ablation harness + task-conditioned distortion
model for context compaction (#1633).

Adds a pure `rate-distortion` module to `core` that replays recorded runs with an
information class ablated (`prior-tool-results`, `resolved-decisions`,
`code-excerpts`, `conversational-history`, `stated-constraints`) and fits a
**distortion model** — a sensitivity matrix over (information class × task class)
derived from the measured error/rework delta, with confidence bounds and a
`sensitive | insensitive | inconclusive` classification per cell, versioned +
timestamped for auditability. The replay execution is an injected `ReplayRunner`
seam (a real driver plugs in; fixtures seed ground truth), so the shipped path
consumes pre-recorded observations and never touches a live execution engine.
The #1632 refinement-demand signal is accepted as an advisory prior (surfaced
per cell, not folded into the verdict). Exposes it as a report-only
`harness distortion fit` subcommand (`--json`).

Scope note: this slice is measurement + reporting only. Wiring the distortion
model into the live compaction dial (frontier-aware compactor), a black-box
replay driver, and rework-attribution loop-closing are deferred to follow-ups
(see `Refs #1633`). This harness is the reusable measurement substrate MDL
pruning (#1630) later reuses.
