---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): per-stage persona system prompts for the local staged workflow

The cloud autopilot delegates each lifecycle phase to a dedicated persona subagent
(harness-planner, -verifier, -code-reviewer …) whose role physically cannot bleed.
The local staged path drives a single model and cannot spawn subagents, so every
stage ran under the same generic identity with its role reduced to a
`(reasoning mode)` label in the user turn.

This threads a per-stage persona into the backend SYSTEM prompt (the wiring already
existed — `startSession` honors `systemPrompt`; the runner just never passed one):
spec/plan stages get a no-code author/planner role, execution a self-verifying
senior-engineer role, verification an INDEPENDENT auditor that does not fix code,
and review an adversarial reviewer that commits nothing. Applied on the local path
only; the cloud path renders byte-identical (undefined → default). This is the
local analog of subagent delegation and reinforces the document/review/code
stage-kind split.
