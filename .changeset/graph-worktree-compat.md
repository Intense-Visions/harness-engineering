---
'@harness-engineering/graph': patch
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
'@harness-engineering/signals': patch
---

Make the knowledge graph work inside git worktrees. `.harness/graph/` is
gitignored, so `git worktree add` never copies it into a linked worktree and
every graph read reported "No graph found". A new `resolveGraphDir` in
`@harness-engineering/graph` lets reads borrow the main worktree's graph (located
via git's `commondir` metadata) when the worktree has none, while writes stay
worktree-local so a scan never clobbers the main graph and a worktree-local scan
still takes precedence. All graph read paths (graph query/export/status,
traceability, impact-preview, freshen, pre-merge-brief, signals, and the whole
MCP graph surface via the shared loader) are routed through it.
