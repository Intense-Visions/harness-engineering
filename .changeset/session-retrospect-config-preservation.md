---
'@harness-engineering/cli': patch
---

Fix two config-preservation gaps in the multi-agent session-retrospect installer (follow-up to #1136).

The installer that wires the opt-in `session-retrospect` trigger into Gemini CLI, Codex CLI, and Cursor documents that "unrelated user config is always preserved," but two paths violated that:

- **Gemini / Cursor JSON clobber (data loss).** When an existing `.gemini/settings.json` or `.cursor/hooks.json` failed to parse (a hand-edited file, JSONC/comments, a trailing comma, a partial write), the reader treated it as absent and the writer then overwrote the whole file with only the harness hook — silently destroying the user's `theme`, `mcpServers`, and every other setting. The reader now distinguishes absent / valid-object / unparseable and the writers report a `conflict` (leaving the file untouched) instead of overwriting, mirroring how `hooks init` refuses to clobber a malformed `.claude/settings.json`.
- **Codex TOML corruption.** The `notify` key was inserted before "the first line beginning with `[`". A top-level nested-array literal (e.g. `matrix = [\n  [1, 2],\n]`) has element lines that begin with `[`, so `notify` could be spliced _inside_ the array and corrupt the TOML. `notify` is now prepended as a top-level key at the very top of the file, which is always valid TOML — it precedes every table and is never placed inside a multi-line array.

Both fixes are covered by new regression tests. Runtime behavior of the hooks themselves is unchanged; this only hardens the one-time install-time config writes.
