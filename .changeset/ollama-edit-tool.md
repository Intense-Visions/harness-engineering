---
'@harness-engineering/orchestrator': minor
---

Add an `edit` tool to the OllamaBackend agent for surgical, targeted file edits (exact
`old_string` → `new_string` replacement with a uniqueness guard), mirroring Claude Code's `Edit`
semantics. The local coding agent previously had only `write_file` (full-file overwrite), which
forced whole-file rewrites for every change and caused it to thrash and reintroduce errors on
multi-step tasks. `write_file` remains for creating new files; the default system prompt now
steers the model to prefer `edit` for changing existing files.
