---
'@harness-engineering/cli': patch
---

Fix every subcommand-declared `--json` (and `--verbose`, `--quiet`, `-c/--config`) being silently inert. The root program declares the same flags and Commander binds a repeated flag to the first command that declared it, so `harness insights --json`, `harness maintenance list --json`, `harness telemetry status --json`, `harness mcp-guard check --json` and ~40 other sites printed human text. A single root `preAction` hook now copies the user's value into each subcommand that redeclares the flag, in either position (`harness <cmd> --json` and `harness --json <cmd>`). A tree-wide guard test fails if any future redeclaration is shadowed again.
