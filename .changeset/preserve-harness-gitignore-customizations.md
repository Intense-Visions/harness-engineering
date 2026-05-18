---
'@harness-engineering/cli': patch
---

Fix `ensureHarnessGitignore` overwriting `.harness/.gitignore` on every MCP start. The function now merges template entries into an existing file instead of replacing it, preserving any custom entries added by users.
