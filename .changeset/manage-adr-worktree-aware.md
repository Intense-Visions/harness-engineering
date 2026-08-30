---
'@harness-engineering/cli': patch
---

`manage_adr` is now git-worktree-aware (#1507). It resolves the ADR root from
the caller's working directory via `git rev-parse --show-toplevel` instead of
writing to the MCP server's launch root, so ADRs authored inside a `git
worktree` land in that worktree (and mint collision-free numbers against its
store) rather than polluting the wrong checkout. Falls back to the supplied
project path when the cwd is not inside a git repository.
