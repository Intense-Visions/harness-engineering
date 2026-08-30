---
'@harness-engineering/cli': patch
---

comprehension: committed compiled-comprehension units no longer pollute raw text search (issue #1692). Committed `_module.md` shards under `.harness/comprehension/` are TRACKED so the LLM-free serve-time hash gate can read them, but that made them show up in `rg` / `grep -r` / editor code search, doubling hits on any symbol that appears in both the source and its unit summary. A repo-root `.ignore` entry (`.harness/comprehension/`) now excludes the shard tree from ripgrep/fd/ag — which honor `.ignore` even for tracked files — WITHOUT untracking the units from git. `harness init` (CLI and MCP `init_project`) and MCP server startup now ensure this entry for new and existing projects via `ensureComprehensionSearchIgnore`. Adopters preferring `storage: "cache"` (gitignored) already sidestep the issue entirely.
