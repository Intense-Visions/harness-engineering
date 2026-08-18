# test-craft interactive collect/finalize handshake

## Goal

Make `test-craft` runnable in an interactive session (Claude Code), where the
calling agent is the LLM judge. Before this change, `test-craft` had only the
inline `runTestCraft` entry point, which loudly refuses the in-session provider
(it defers every prompt, so a run would report zero findings for zero
critiques). There was no `test_craft_finalize` tool, so `test-craft` could only
run against a real backend.

This gives `test-craft` the same two-step collect → finalize handshake that
`code-craft`, `api-craft`, `naming-craft`, and `cli-ergonomics-craft` already
have, so Claude can be the judge interactively.

## Stages

1. **critique phase refactor** (`packages/cli/src/test-craft/phases/critique.ts`)
   - Export `CRITIQUE_SYSTEM_PROMPT` (was inline in `critiqueOne`).
   - Export a pure `buildPrompt({ test, rubric, sourcePair? })` (was private,
     tied to `CritiqueInput` which carried the provider).
   - Extract and export a pure `parseFindingFromRaw(raw, { test, rubric })`
     that the inline `critiqueOne` and the new `finalize` both use.

2. **collect** (`collectTestCraftPrompts`) — enumerate the same (test, rubric)
   pairs `runTestCraft`'s critique loop uses (reusing `extractTestsFromFiles`,
   including source-pairing), build one prompt per pair, persist run-state to
   the shared craft runs store under a new `runId`, and return
   `{ runId, pendingPrompts, projection, status }` with a prompt-count budget
   guard. No LLM is called.

3. **finalize** (`finalizeTestCraft`) — load run-state by `runId` (clear error
   when missing / skill-mismatched), parse each `responses[].raw` fenced JSON
   into a `TestFinding` via the shared parser, delete the run-state, and return
   the same `TestCraftOutput` shape `runTestCraft` returns.

4. **guard** — keep `runTestCraft` / `critiqueTestsInFile`'s InSession refusal;
   update the message to point at `collectTestCraftPrompts(...)` /
   `finalizeTestCraft(...)`.

5. **MCP** — make `test_craft` the collect handler (returns prompts + "call
   test_craft_finalize" in-session, runs inline otherwise), add a
   `test_craft_finalize` handler, and register both in `server.ts`
   (TOOL_DEFINITIONS + TOOL_HANDLERS) and `tool-capability-declarations.ts`.

6. **tests + generated artifacts** — MCP tool tests mirroring code-craft
   (collect returns runId + non-empty prompts; round-trip; missing-runId
   error; non-array responses reject); update the two exact tool-count
   assertions (107 → 108); regenerate `docs/reference/mcp-tools.md`,
   `docs/reference/tool-catalog.md`, and plugin artifacts.

## Assumptions

- The established collect pattern across the four sibling craft skills builds
  prompts directly via the exported `buildPrompt` (it does not drive the
  InSession provider's deferred queue); test-craft mirrors that.
- `finalizeTestCraft` only needs `{ test, rubric }` to rebuild a finding — the
  source-pair is used solely at prompt-build (collect) time — so run-state
  persists the `ExtractedTest` plus `rubricId` per prompt.
- `critiqueErrors` is always 0 in the finalize summary: the calling agent
  answers every prompt, so there is no per-critique LLM throw to count.
- This is the interactive follow-up to the guard bug (#1368), which #1430
  already addressed; hence `Refs #1368`, not `Closes`.
