---
'@harness-engineering/burn': minor
'@harness-engineering/cli': patch
---

feat(burn): attribute token spend to the subagent that spent it

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
