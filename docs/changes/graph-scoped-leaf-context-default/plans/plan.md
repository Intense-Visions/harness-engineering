---
title: Plan — graph-scoped leaf-context assembly by default
slug: graph-scoped-leaf-context-default
issue: 1524
spec: docs/changes/graph-scoped-leaf-context-default/proposal.md
---

# Plan — graph-scoped leaf-context assembly by default (#1524 slice)

## Task 1 — Config type + default (types)

- `packages/types/src/orchestrator.ts`: add `export type RetrievalMode =
'graph-scoped' | 'raw'`, `export const DEFAULT_RETRIEVAL_MODE: RetrievalMode =
'graph-scoped'`, and `AgentConfig.retrievalMode?: RetrievalMode` with doc
  comment (default graph-scoped; `'raw'` byte-identical opt-out).
- `packages/types/src/index.ts`: export `RetrievalMode` (type) and
  `DEFAULT_RETRIEVAL_MODE` (value).

## Task 2 — Config validation (orchestrator)

- `packages/orchestrator/src/workflow/config.ts`: add `RetrievalModeSchema =
z.enum(['graph-scoped','raw'])` and validate `agent.retrievalMode` when present
  (typo → `agent.retrievalMode` error); absent ⇒ default.

## Task 3 — Directive in both stage-prompt templates (orchestrator)

- `packages/orchestrator/src/workflow/stage-prompt-template.ts` and
  `local-stage-prompt.ts`: add a `{% if retrievalMode == 'graph-scoped' %}…{%
endif %}` directive naming `code_outline` / `code_unfold` / `find_context_for`
  and reserving raw source for the edit region. Placed so the `'raw'` render is
  byte-identical to the pre-slice template.

## Task 4 — Thread the mode through the dispatch prompt builder (orchestrator)

- `orchestrator-context.ts`: `renderStagePromptFactory` takes the resolved mode
  and supplies it as a template variable; `BuildWorkflowContextDeps.retrievalMode?`;
  `buildWorkflowContext` passes `deps.retrievalMode ?? DEFAULT_RETRIEVAL_MODE`.
- `orchestrator.ts`: at the `buildWorkflowContext` dispatch call, thread
  `config.agent.retrievalMode` when set.

## Task 5 — Tests (WIRED)

- `src/workflow/local-stage-prompt.test.ts`: add `retrievalMode` to the render bag;
  add a describe block proving default (graph-scoped) renders the directive naming
  all three tools + the edit-region wording, and `'raw'` omits it and is
  byte-identical to the directive-stripped graph-scoped render — for BOTH templates.
- `tests/workflow/config.test.ts`: accept absent (default) / `'raw'` /
  `'graph-scoped'`; reject a typo with an `agent.retrievalMode` error.

## Task 6 — Contract doc

- `docs/reference/fleet-family.md`: add the graph-scoped-by-default paragraph to
  the context-budget section and move the routing item out of "deferred" (leaving
  batching + cache-read measurement + A/B deferred).

## Task 7 — Release + gates

- Changeset (`types` + `orchestrator`, minor). Build CLI, run format, typecheck,
  and the orchestrator workflow suites. Ship through the real pre-commit/pre-push
  gates.

## Verification

- `default → graph-scoped` and `raw → byte-identical` proven at the prompt-render
  level (the live mechanism); config validation proven; full orchestrator workflow
  suite green.
