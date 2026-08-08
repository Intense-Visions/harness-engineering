---
'@harness-engineering/cli': minor
---

Emit a PATH-resolvable Codex `notify` command instead of a machine-specific absolute path.

`harness update` / `harness hooks init` now wire Codex's `.codex/config.toml` `notify` as `["harness", "hooks", "run", "session-retrospect-codex"]` rather than `["node", "<abs path>/.harness/hooks/session-retrospect-codex.js"]`. The generated line no longer contains a machine-specific filesystem path, so it is byte-identical on every machine and safe to commit for the whole team (previously it churned per machine and broke other contributors and CI).

A new `harness hooks run <name> [payload]` subcommand backs this: it reads the JSON payload Codex delivers on argv, self-locates the project from the payload's `cwd`, and delegates to the shared session-retrospect core. It is fail-soft (unknown name, absent/malformed payload, or any error exits 0). An existing absolute-path Codex `notify` line written by a prior harness version is upgraded in place on the next run; a foreign `notify` is left untouched. Claude, Gemini, and Cursor hook wiring is unchanged.
