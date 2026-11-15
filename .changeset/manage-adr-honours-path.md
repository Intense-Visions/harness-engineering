---
'@harness-engineering/cli': patch
---

fix(mcp): `manage_adr` now honours its `path` argument for every action instead of resolving the ADR root from the MCP server's `process.cwd()` (its launch checkout), so worktree-isolated `-fleet` lanes no longer write ADRs into — or allocate numbers from — the shared checkout. The returned `file` is now the absolute path actually read or written, a `path` that does not exist fails loudly, frontmatter values YAML would misread (e.g. `source: #834`, which parsed as null) are single-quoted, and the default `date` is the local calendar date rather than the UTC one (#2145).
