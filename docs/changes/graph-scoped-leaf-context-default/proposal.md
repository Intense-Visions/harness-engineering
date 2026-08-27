---
title: Assemble a dispatched leaf's context graph-scoped by default
slug: graph-scoped-leaf-context-default
issue: 1524
status: planned
milestone: v5.0 — Telemetry & Effectiveness
keywords:
  - fleet
  - context-replay
  - graph-scoped
  - code_outline
  - code_unfold
  - find_context_for
  - dispatch
  - retrieval-mode
  - leaf
---

# Assemble a dispatched leaf's context graph-scoped by default

> A deferred slice of #1524. The merged enforcement core (PR #1586) _caps_ a
> leaf's assembled context; this slice _reduces_ it — every dispatched-leaf stage
> prompt now assembles context **graph-scoped by default** (`code_outline` /
> `code_unfold` / `find_context_for`), reading raw whole-file source only for the
> region under edit. An `agent.retrievalMode: 'raw'` flag is the byte-identical
> opt-out.

## Overview and goals

Measured local usage is overwhelmingly context _replay_, not generation:
cache-read : output ≈ **298 : 1** (#1524). Because a fresh fleet leaf's assembled
context is re-read on every turn, the dominant cost term is `context_size ×
turns`, and fan-out width multiplies it. The merged slice (#1586) added a
fail-loud per-leaf context **budget** — a ceiling — but a ceiling only rejects the
worst offenders; it does not shrink the ordinary load. The single largest,
correctness-preserving lever on the load itself is **how a leaf reads code**:
graph-scoped retrieval pulls just the definitions, call sites, and neighbourhood a
task needs, where a raw whole-file read pays for an entire file to touch a few
lines.

Goal: make graph-scoped retrieval the **default** context-assembly strategy for a
dispatched leaf, with raw whole-file reads reserved for the exact region under
edit, and a config flag to opt fully back out to raw.

## The seam (why this wiring point, and not another)

A dispatched leaf is an autonomous agent (Claude subagent on the cloud path; a
codex/ollama coder on the local path). Its raw whole-file reads happen through the
_client's own_ file tools (Claude Code's `Read`, codex's read), which the harness
cannot intercept in code — there is no central harness function that reads whole
files to build a leaf's context (`gather_context` is already graph-based and reads
no source files). The effective lever on _how a leaf reads_ is therefore the
**dispatch prompt** it is handed. That prompt is built by code, in one place:

```
agent.retrievalMode (config)
  → buildWorkflowContext (orchestrator.ts dispatch)
    → renderStagePromptFactory (orchestrator-context.ts)
      → STAGE_PROMPT_TEMPLATE / LOCAL_STAGE_PROMPT_TEMPLATE (retrievalMode variable)
        → the dispatched leaf's prompt
```

This is a real, traceable, testable code seam — not agent-prompt guidance alone —
so a reviewer can follow `agent.retrievalMode` to the exact directive a leaf
receives, and a test can assert default = graph-scoped, opt-out = raw.

## Approach

1. **Config.** Add `agent.retrievalMode?: 'graph-scoped' | 'raw'` to `AgentConfig`
   (`@harness-engineering/types`), with `DEFAULT_RETRIEVAL_MODE = 'graph-scoped'`.
   Validated at config-load (`validateWorkflowConfig`) so a typo is rejected, not
   silently coerced.

2. **Directive in both stage-prompt templates.** A `{% if retrievalMode ==
'graph-scoped' %}…{% endif %}` block instructs the leaf to retrieve code
   graph-scoped via `code_outline` / `code_unfold` / `find_context_for` first and
   read raw source **only for the region under edit**. Present on the default
   (cloud) and LOCAL templates alike — the expensive fleet leaves ride both.

3. **Thread the mode.** `renderStagePromptFactory` gains the resolved mode
   (`deps.retrievalMode ?? DEFAULT_RETRIEVAL_MODE`) and supplies it as a template
   variable; `buildWorkflowContext` reads `config.agent.retrievalMode` at the
   dispatch site.

4. **Reuse, don't reimplement.** The directive points at the existing
   `code_outline` / `code_unfold` / `find_context_for` tools/handlers; no new
   retrieval code is written.

## Acceptance criteria

- [x] By default (no config), a dispatched-leaf stage prompt contains the
      graph-scoped directive naming `code_outline` / `code_unfold` /
      `find_context_for`, and still directs raw source for the edit region.
- [x] `agent.retrievalMode: 'raw'` renders a stage prompt **byte-identical** to
      the pre-slice template (directive omitted) — proven by a test that strips the
      directive block from the graph-scoped render and asserts equality with the
      raw render.
- [x] `agent.retrievalMode` is validated at config-load: `'graph-scoped'` / `'raw'`
      accepted, anything else rejected with an `agent.retrievalMode` error;
      absent ⇒ graph-scoped default.
- [x] The change is byte-identical when opted out; correctness is preserved in the
      default (the edit region still gets full source).

## Scope / non-goals (siblings still deferred under #1524)

Batching queue items per leaf, wiring the measured cache-read into lane provenance
(`LeafContextSpend.cacheReadTokens`), and the A/B-on-a-fixture-fleet acceptance run
remain separate deferred slices. This slice ships the default retrieval strategy
and its opt-out; hence **`Refs #1524`**, not `Closes`.
