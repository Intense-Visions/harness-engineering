---
'@harness-engineering/cli': minor
---

feat(cli): make copy/docs/knowledge/security/spec craft skills runnable in an interactive session (#1368)

The older craft-family inline entries — `runCopyCraft`, `runDocsCraft`,
`runKnowledgeCraft`, `runSecurityCraft`, and `runSpecCraft` — wrap every
per-(target, rubric) critique in a bare `catch {}`. Under the default
in-session provider that swallow ate the `PromptDeferredError` thrown by every
`callText`, so the run returned `findings: []` with `llmCalls.count: 0` and no
error: a confident "nothing to critique" for a run in which no LLM call ever
completed. Each inline entry now refuses the in-session provider up front with a
loud, actionable error instead of a hollow empty success.

Rather than only refusing, these five crafts now support the same two-step
collect → finalize handshake that `code-craft`, `api-craft`, `naming-craft`, and
`cli-ergonomics-craft` already use, so they run interactively in Claude Code with
the calling agent as the LLM judge. Each craft gains a `collect<Craft>Prompts`
step (enumerates the identical (target, rubric) pairs the inline critique loop
walks, persists run-state to the shared craft runs store, and returns the prompts
for the calling agent to answer) and a `finalize<Craft>` step (parses the agent's
fenced-JSON responses back into the craft's finding type). Five new MCP tools —
`copy_craft_finalize`, `docs_craft_finalize`, `knowledge_craft_finalize`,
`security_craft_finalize`, and `spec_craft_finalize` — are registered, and the
`*_craft` collect tools default to in-session mode in Claude Code.
