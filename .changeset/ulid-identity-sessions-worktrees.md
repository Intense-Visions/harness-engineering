---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/orchestrator': minor
---

ULID identity for sessions and worktree-isolated tasks (#603)

Add immutable ULID identity for sessions and worktree-isolated tasks. Every
session and worktree task now gets a collision-free, lexicographically sortable
ULID at creation (recorded in an additive `identity.json`), plus a human-friendly
sequential number assigned at completion (session archive / worktree ship). Fully
backward-compatible and best-effort — the existing slug remains the display label
and on-disk directory name.
