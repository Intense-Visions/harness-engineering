---
'@harness-engineering/orchestrator': minor
---

Improve the OllamaBackend agent's editing loop with two wrapper fixes:

- **`edit` tool** for surgical, targeted file edits (exact `old_string` → `new_string`
  replacement with a uniqueness guard), mirroring Claude Code's `Edit` semantics. The local
  coding agent previously had only `write_file` (full-file overwrite), which forced whole-file
  rewrites for every change and caused it to thrash and reintroduce errors on multi-step tasks.
  `write_file` remains for creating new files; the default system prompt now steers the model to
  prefer `edit` for changing existing files.
- **Failure-prioritized tool-output truncation.** Tool output is now truncated keeping both the
  head and (a larger) tail, and the budget is raised from 4000 to 8000 chars. Previously a
  head-only chop discarded the trailing failure diffs and summary that `vitest`/`tsc` print last —
  so the model was asked to fix failures it could not read.
