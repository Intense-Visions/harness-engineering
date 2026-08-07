# session-retrospect installer must never destroy an agent's existing config

**Keywords:** hooks, session-retrospect, multi-agent, gemini, codex, cursor, config-preservation, data-loss, toml, json

## Overview

Retroactive-review follow-up to #1136 (multi-agent `session-retrospect` triggers
for Claude Code, Gemini CLI, Codex CLI, and Cursor). #1136 shipped without a
harness code-review pass; a retroactive review found two ways the install-time
config writers in `packages/cli/src/hooks/agent-retrospect.ts` violate their own
stated contract — "unrelated user config is always preserved."

Both are install-time (`harness hooks init`) issues. The runtime hooks
themselves are unaffected.

### Problem 1 — Gemini/Cursor JSON clobber (silent data loss)

`readJsonObject` returned `{}` for any file it could not `JSON.parse`, and the
writers (`writeGeminiSessionEndHook`, `writeCursorRetrospectHooks`) then wrote
that object back — replacing the user's entire `.gemini/settings.json` /
`.cursor/hooks.json` with only the harness hook.

Trigger: any existing-but-unparseable config — a trailing comma, JSONC-style
comments, a hand edit in progress, or a partially written file. Result: the
user's `theme`, `mcpServers`, and all other settings are silently destroyed.

This is inconsistent with `hooks init`, which _throws_ rather than clobber a
malformed `.claude/settings.json`.

### Problem 2 — Codex TOML corruption on top-level nested arrays

`writeCodexNotifyHook` inserted the top-level `notify` key before the first line
matching `/^[ \t]*\[/` (assumed to be a table header). A top-level array literal
whose element lines begin with `[` — e.g.

```toml
matrix = [
  [1, 2],
  [3, 4],
]
```

makes the element line `  [1, 2],` match that pattern, so `notify` is spliced
into the middle of the array, producing corrupt TOML.

### Goals

1. Never overwrite an existing, unparseable agent config — report a `conflict`
   and leave the file byte-for-byte untouched (surfaced to the user as a warning
   with a reason).
2. Never corrupt a Codex `config.toml` regardless of top-level array shape.
3. Preserve all existing behavior: fresh install, idempotent re-run, foreign
   `notify` conflict, and preservation of valid unrelated config.

### Out of scope

- The at-most-once-per-session semantics and the "archive the most-recently
  modified session" resolver (design as shipped in #1136).
- Windows shell-command portability of `buildHookCommand` (pre-existing, shared
  by all harness hooks — not introduced by #1136).

## Approach

- Replace `readJsonObject` with `readJsonConfig` returning a discriminated
  `absent | parsed | unparseable` result. Empty files count as `absent` (safe to
  create); valid non-object JSON (array/string) counts as `unparseable` (do not
  merge). Gemini/Cursor writers return `conflict` on `unparseable`.
- Attach a human-readable `reason` for Gemini/Cursor conflicts in
  `installAgentRetrospectHooks` (parity with the existing Codex conflict reason);
  `printInitResult` already warns on `conflict`.
- Replace the Codex "insert before first table" logic with a prepend of the
  top-level `notify` key at the very top of the file — always valid TOML,
  independent of any array/table shape below.

## Acceptance criteria

- Given an existing `.gemini/settings.json` that fails `JSON.parse`, when the
  Gemini writer runs, then it returns `conflict` and the file is unchanged.
- Given an existing `.cursor/hooks.json` that fails `JSON.parse`, when the Cursor
  writer runs, then it returns `conflict` and the file is unchanged.
- Given an empty (whitespace-only) config file, when the writer runs, then it
  installs cleanly (treated as absent).
- Given a `config.toml` containing a top-level multi-line array whose element
  lines begin with `[`, when the Codex writer runs, then `notify` is added as a
  top-level key, the array survives intact, and no array line is split.
- All pre-existing agent-retrospect tests continue to pass (fresh install,
  idempotency, unrelated-config preservation, foreign-notify conflict).
