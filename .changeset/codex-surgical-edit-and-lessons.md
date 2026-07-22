---
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': minor
'@harness-engineering/types': minor
---

feat: surgical-edit path for local/codex agents + apply the ollama-campaign lessons

A local model driven through Codex has no working `apply_patch` (freeform variant is
grammar-constrained / GPT-5-only; the function variant is not offered to third-party
OSS models), so it falls back to shell redirection that clobbers files — observed live
deleting a barrel `index.ts`. This adds the missing pieces:

- **`edit_file` MCP tool** (`@harness-engineering/cli`) — exact `old_string` → `new_string`
  surgical replace with a unique-match guard and clear, recoverable errors; refuses
  ambiguous/missing matches instead of guessing. Ships in `harness-mcp`; opt-in via a
  server's `tools` allowlist.
- **Staged-workflow prompt** now steers local agents to PREFER an exact-edit tool
  (`harness__edit_file` or equivalent) **if present**, and otherwise to edit surgically
  and never rewrite whole files or use `cat >`/`echo >>`/`apply_patch` — degrades
  gracefully for adopters who don't enable the tool.
- **`reasoningEffort`** on the `codex` backend (`-c model_reasoning_effort`) — a hands-on
  coder wants `'low'`.
- **Docs:** a codex-backend + `edit_file` section in the multi-backend-routing guide,
  including the sampling constraint (Codex owns the request and auto-pulls the model, so
  sampling params cannot be injected the way endpoint backends do).

Also locks in the within-run worktree-preservation contract (a gate-block re-dispatch
reuses the ONE worktree so the agent's uncommitted progress survives) with a regression
test — the earlier ollama-path bug wiped the worktree every re-dispatch.
