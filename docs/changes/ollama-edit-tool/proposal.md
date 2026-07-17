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

A companion fix — failure-prioritized tool-output truncation, previously a blind 4000-char
head-chop that discarded trailing test-failure diffs — is **included in this change** (see
"Companion fix" below).

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

## Companion fix: failure-prioritized tool-output truncation

`truncate()` previously kept `slice(0, 4000)` — the HEAD — and discarded the tail. `vitest`/`tsc`
print the actionable failure diffs and the summary LAST, so the model running its test command
saw the passing preamble and lost the failures it needed to fix. Fix:

- Raise `MAX_TOOL_OUTPUT` 4000 → 8000 (holds a typical test report).
- Truncate keeping **both ends**: a head slice (`TRUNCATE_HEAD_FRACTION` = 30% — command echo +
  first errors) and a larger tail slice (70% — failures + summary), with a `…(N chars
truncated)…` marker between them.

### Acceptance criteria (companion)

- **SC9** Short output is returned unchanged (no marker).
- **SC10** A long report with its failure summary at the tail keeps that tail (a head-only chop
  would have dropped it); the head is also preserved; the omitted-char count is reported.

## Companion fix 2: progress-based turn termination

The per-`runTurn` loop bailed on a flat iteration count (`DEFAULT_MAX_TURNS = 50`). A less-capable
local model needs more read→edit→test→fix cycles than a frontier model to reach the same place, so
a low flat cap terminates runs that are still progressing — observed live: a real multi-file
roadmap item hit a cap of 60 with the full test suite already passing and only a few strict-type
errors left. Claude Code / Codex don't stop on a small fixed step count; they run until done or
genuinely stuck. Fix:

- Raise `DEFAULT_MAX_TURNS` 50 → 150 and treat it as a runaway _backstop_, not the normal stop.
- Add a **stall detector**: end the run early only when the model emits the identical tool call
  (same name + same args) for `STALL_REPEAT_LIMIT` (4) consecutive turns — genuine thrash — while
  varied, progressing runs continue up to the backstop.

### Acceptance criteria (companion 2)

- **SC11** A run repeating the identical tool call terminates with a "stalled" error well before
  the backstop (bounded model calls).
- **SC12** A run whose tool calls vary between turns is not tripped by the detector and runs to
  completion.
