---
'@harness-engineering/cli': minor
---

Fix a silent no-op in `code-craft`, `cli-ergonomics-craft`, and `api-craft` when
run in their default (in-session) runtime mode.

The default LLM provider for the craft family is the in-session provider: rather
than call an LLM, it records each prompt and throws a deferral sentinel so the
host chat session can answer the prompts and feed them back through a second
`<skill>_finalize` step. `naming-craft` already implemented this two-step
collect → finalize flow, but the three skills above swallowed the deferral in a
bare `catch {}` and never surfaced the collected prompts. The result was that a
default-mode invocation returned zero findings and exited successfully — a silent
lie that looked like a clean pass.

These three skills now implement the real two-step flow, mirroring
`naming-craft`:

- Each orchestrator gains `collect<Skill>Prompts` (walks the target, builds one
  prompt per unit/command/surface × rubric, persists run-state, and returns the
  prompts) and `finalize<Skill>` (stitches the host's answers back into findings
  through the same parser the inline path uses).
- The inline entry points (`runCodeCraft`, `runCliErgonomicsCraft`,
  `runApiCraft`) now fail loudly with guidance when handed the in-session
  provider instead of returning an empty result.
- Three new MCP tools — `code_craft_finalize`, `cli_ergonomics_craft_finalize`,
  and `api_craft_finalize` — complete the flow, and the three primary tools now
  route to the collect step in in-session mode (raising the harness MCP tool
  count to 101).

Also closes two `code-craft` discovery gaps: it now falls back to conventional
`src/` (then `app/`) roots when a project has no `packages/` directory — so a
single-package repo is no longer scanned as empty — and excludes `fixtures/`
directories from the walk, matching its `cli-ergonomics-craft` and `api-craft`
twins.
