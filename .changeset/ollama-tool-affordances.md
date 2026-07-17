---
'@harness-engineering/orchestrator': minor
---

Add three proven agent-tool affordances to the OllamaBackend, matching Claude Code / Codex:

- **Bash exit code.** A non-zero command exit is now annotated (`[command exited with code N]`) so
  the local model can tell success from failure without parsing output.
- **Read paging + line numbers.** `read_file` output is line-numbered (`<n>\t<content>`, reference
  only) and accepts optional `offset` (1-based start line) and `limit` params, so large files can be
  read in chunks instead of returning a truncated whole-file blob. It also reports a clean
  "file not found" instead of throwing.
- **Edit `replace_all`.** The `edit` tool takes an optional `replace_all: true` to change every
  occurrence (e.g. renaming a symbol) instead of requiring a unique match; the default remains the
  unique-match guard.
