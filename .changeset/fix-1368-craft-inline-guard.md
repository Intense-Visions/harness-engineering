---
'@harness-engineering/cli': patch
---

fix(cli): guard the in-session provider across the older craft skills to stop hollow success (#1368)

The older craft-family inline entries — `runCopyCraft`, `runDocsCraft`,
`runKnowledgeCraft`, `runSecurityCraft`, and `runSpecCraft` — wrap every
per-(target, rubric) critique in a bare `catch {}`. Under the default
in-session provider that swallow ate the `PromptDeferredError` thrown by every
`callText`, so the run returned `findings: []` with `llmCalls.count: 0` and no
error: a confident "nothing to critique" for a run in which no LLM call ever
completed.

Each inline entry now refuses the in-session provider up front with a loud,
actionable error — mirroring the guard `naming-craft` and `test-craft` already
carry — instead of silently reporting a hollow empty success. These crafts have
no two-step collect/finalize flow, so the message points at configuring a real
backend (`HARNESS_CRAFT_LLM`) rather than a nonexistent finalize step.
