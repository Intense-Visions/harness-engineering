---
'@harness-engineering/cli': minor
---

feat(mcp): route large truncated tool output through spill-to-disk with a recoverable locator (#1398)

Wire the spill-to-disk primitive into the MCP compaction middleware
(`wrapWithCompaction`), the single choke point every tool response flows through.
When a tool's output is large enough to be lossy-truncated by the truncation
pipeline, the full pre-compaction payload is now offloaded to disk via
`spillIfNeeded` and a followup-readable `harness-spill:` locator is appended to the
compacted result, so fleet workers and autopilot sessions can recover or grep the
complete test log / diff / grep overflow on a later turn (`readSpill` /
`searchSpill`) instead of losing the truncated tail. Output under the threshold
passes through unchanged, lossless-only tools are excluded, and spill fails open —
behavior is unchanged when no project root is available.
