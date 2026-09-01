---
'@harness-engineering/core': minor
'@harness-engineering/orchestrator': minor
---

feat(provenance): emit a machine-readable provenance trailer from agent-authored
commits (#1531).

Adds a distinct, governed git commit **trailer** carrying the provenance of an
autonomous, agent-authored commit, so AI-authored work — specifically the
_autonomous_ tier — is mechanically countable, joinable to cost, and auditable
on gated paths. A pure `commit-trailer` primitive in `core` defines the schema
(`Harness-Run: <skill>@<version>` plus `Harness-Provenance-Version`,
`Harness-Run-Id`, `Harness-Lane`, `Harness-Agent`, `Harness-Model`,
`Harness-Session`), a deterministic formatter/appender, and a parser that returns
`null` for non-fleet commits. The trailer uses a distinct `Harness-*` namespace
rather than co-opting `Co-authored-by:`, so mechanical tier detection is possible.

The orchestrator's autonomous ship path (`WorkspaceManager.shipWorkspace`) stamps
the trailer onto the commit message and — because the repo squash-merges — mirrors
it into the PR body so the record survives the squash. Interactive and
third-party commits (no run context threaded) are byte-unaffected.

Scope note: this slice is the schema + formatter + parser + emission + docs. A CI
check that verifies trailer presence/shape and a `harness provenance <sha>` reader
CLI are deferred to follow-ups (see `Refs #1531`).
