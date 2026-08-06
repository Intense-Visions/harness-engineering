---
'@harness-engineering/orchestrator': patch
---

Break the circular import among the workflow modules
(`orchestrator-context.ts` ↔ `local-stage-prompt.ts`, and
`orchestrator-context.ts` → `execute-workflow.ts` → `local-stage-prompt.ts` →
`orchestrator-context.ts`). The shared `STAGE_PROMPT_TEMPLATE` constant moves to
a new dependency-free leaf module `workflow/stage-prompt-template.ts`;
`orchestrator-context.ts` re-exports it (preserving the existing import surface)
and `local-stage-prompt.ts` now imports it directly from the leaf. This removes
the shared back-edge that closed both cycles. No runtime behavior change — the
template string is byte-identical and all exports keep their names.
