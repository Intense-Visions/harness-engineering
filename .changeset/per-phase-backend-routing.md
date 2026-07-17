---
'@harness-engineering/orchestrator': minor
---

Finish per-phase backend routing for staged local workflows. A staged workflow's
design stages (`cognitiveMode: thinking`) now route to `routing.modes.thinking`'s
backend and execution stages to `routing.default`, via the existing
`BackendRouter.route()` per-stage path. A routed local-endpoint backend
(`local`/`pi`/`ollama`) now renders a local-aware stage prompt that uses the
`harness skill run <skill> --autonomous` indirection instead of the Claude-shaped
"perform the skill" template. `validateWorkflowConfig` now rejects a staged-decl
stage whose `cognitiveMode` has no `routing.modes`/`routing.skills` mapping.
Unstaged workflows and single-backend configs are byte-identical to before.
