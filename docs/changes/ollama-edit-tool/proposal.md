# Proposal: `edit` tool for the OllamaBackend agent

## Motivation

Live breaking-point probing of the local coding agent (qwen3-coder:30b via `OllamaBackend`)
showed the model **thrashing** on stateful-logic tasks: 14 full-file rewrites, the same
`TS18048` five times, never converging. Root-cause audit found this is substantially a
**wrapper gap**, not a model-capability limit:

- The backend's only mutation tool is `write_file` (full-file overwrite). Every change forces
  the model to **rewrite the entire file from memory**, so each edit drops prior fixes and
  reintroduces errors — the thrash engine.

Every serious coding harness solves this with a **surgical edit** primitive: Claude Code's
`Edit` (exact string replace), Codex's `apply_patch`, Aider's edit-blocks. The sibling
`PiBackend` already advertises a `codingTools: ['read', 'bash', 'edit', 'write']` set. The
`OllamaBackend` should have the same affordance.

(A companion fix — failure-prioritized tool-output truncation, currently a blind 4000-char
head-chop that discards trailing test-failure diffs — is tracked separately and folded next.)

## Scope (this change)

Add an `edit` built-in tool to `packages/orchestrator/src/agent/backends/ollama.ts`, mirroring
Claude Code `Edit` semantics. `write_file` stays for creating new files.

### Tool contract

- Name: `edit`. Params: `{ path, old_string, new_string }` — all required strings.
- `path` resolves inside the workspace (reuse `resolveInsideWorkspace`); outside ⇒ error.
- The file must already exist; if not ⇒ error directing the model to `write_file`.
- `old_string` must occur **exactly once**:
  - 0 occurrences ⇒ `ERROR: old_string not found …` (model self-corrects).
  - > 1 occurrences ⇒ `ERROR: old_string is not unique (appears N times); add surrounding context`.
- `old_string === new_string` ⇒ `ERROR: old_string and new_string are identical (no-op)`.
- On success: replace the single occurrence via **string slicing** (never `String.replace`,
  which would first-match-only and interpret `$&`/`$1` in the replacement), write back, return a
  short confirmation.
- Read the full file for matching (do **not** route through the truncating `runReadFile`).

### Wiring

1. `TOOL_SCHEMAS` — add the `edit` function schema (after `write_file`).
2. `dispatchToolCall` — add `'edit'` to the `isBuiltin` predicate.
3. `executeTool` — add `case 'edit'` → `runEditFile(...)`.
4. `runEditFile(workspacePath, path, old_string, new_string)` — new private method.
5. `DEFAULT_SYSTEM_PROMPT` — instruct: prefer `edit` for changing existing files; use
   `write_file` only to create new files.

## Acceptance criteria

- **SC1** Existing OllamaBackend + ollama-mcp tests stay green (no tool-list assertion breaks).
- **SC2** A successful `edit` replaces the unique occurrence and persists it.
- **SC3** Not-found `old_string` returns an actionable error, file unchanged.
- **SC4** Ambiguous (>1) `old_string` returns a uniqueness error, file unchanged.
- **SC5** `edit` on a missing file returns an error pointing to `write_file`, no file created.
- **SC6** `edit` outside the workspace is refused.
- **SC7** `old_string` containing regex-special chars (`$&`, `.*`, backslashes) and multi-line
  spans replace literally and correctly.
- **SC8** Verification: re-run the same difficulty-ladder dispatch (stateful ESLint rule) and
  confirm reduced rewrite-thrash / convergence vs. the write_file-only baseline.
