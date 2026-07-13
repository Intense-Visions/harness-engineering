---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

Complete split-routing (4b): real per-stage prompt rendering + prior-output
threading. The workflow stage-execution engine previously passed each stage the
bare **skill name** as its prompt and threaded nothing between stages (`priorOutputs`
returned `{}`). Now:

- Each stage gets a **rendered prompt** (the work item + the stage's skill/role +
  the outputs of prior stages) via a pure `PromptRenderer` bound in
  `buildWorkflowContext` (no layer-cycle). The engine falls back to the skill name
  only when no renderer is present (fake/legacy contexts), so behavior is
  byte-identical there.
- Each stage's **final assistant message** is captured (from the runner's last
  `result` event, the same extraction the single-agent path uses) into a new
  `StageRun.output`, and threaded to later stages keyed by the stage's `produces`
  label (D4 **text**-artifact threading).

File-artifact threading (`produces`/`expects` as workspace paths) remains a
separate, deferred contract — the text channel covers the common case.
