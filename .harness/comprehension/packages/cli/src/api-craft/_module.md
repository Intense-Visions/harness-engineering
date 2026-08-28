---
schemaVersion: 1
module: 'packages/cli/src/api-craft'
sourceHash: '2451a278b26fba64304e1f998d8765552783ed25c430cda272c13d442b263e00'
compiledAt: '2026-08-28T01:22:08.707Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

**api-craft** is an LLM-based API quality reviewer that discovers a project's API surfaces—OpenAPI specs and route handlers—and critiques each against a kind-filtered rubric suite. It operates in two modes: **inline** (discover → critique → findings in one call via `runApiCraft`) and **in-session** (two-step: `collectApiCraftPrompts` → LLM external processing → `finalizeApiCraft`). Files without route signals are skipped to avoid false-positive critiques of helper code. It's a structural twin of `cli-ergonomics-craft` in the broader craft-pipeline, providing the LLM-judgment ceiling for API design (complementing knowledge-based floor rules from harness-api-openapi-design and harness-api-webhook-design).

## Invariants

- Route signal filtering: Files lacking route/handler signals are skipped—cost management and FP control. Only discovered surfaces reach the rubric loop.
- Kind-based rubric routing: API surface kind (REST, WebHook, etc.) determines which rubrics apply. A mismatch between discovered kind and rubric set breaks finding relevance.
- State identity across collect→finalize: The runId, promptId, and rubricId triplet must survive serialization and retrieval; a mismatch or stale state load causes findings to silently drop (lookup fails, continue).
- Cost budgeting barrier: DEFAULT_PROMPT_BUDGET (100) caps pending prompts before collection returns budget-exceeded. Exceeding this returns empty prompts and a hint, preventing runaway LLM bills.
- Per-surface error isolation: critiqueSurface catches exceptions per (surface, rubric) pair and swallows them; one malformed file or rubric doesn't crash the run.
- Inline mode provider type-check: runApiCraft explicitly rejects InSessionLlmProvider with a clear error; the two flows are incompatible.
- Run state deletion on finalization: Successful finalizeApiCraft calls deleteRunState. Orphaned state from failed finalization can cause confusion; garbage collection via pruneOldRuns is advisory, not guaranteed.
- Exemplar/rubric catalog availability: SEED_EXEMPLARS and SEED_RUBRICS are immutable singletons; runtime changes to these won't be reflected in already-running or finalized sessions.

## Interface Contract

```ts
export API_ROOTS
export ApiCraftOutput
export ApiExemplar
export ApiFinding
export ApiRubric
export ApiSurfaceKind
export DiscoveredApiSurface
export OPENAPI_ROOTS
export SEED_EXEMPLARS
export collectApiCraftPrompts
export critiqueApiSurfaceFile
export finalizeApiCraft
export runApiCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js'
import { ApiSurfaceKind, SEED_RUBRICS, rubricsForKind } from './catalog/rubrics/index.js'
import { DiscoveredApiSurface, classifyApiSurface, discoverApiSurfaces } from './extract/discover.js'
import { ApiCraftOutput, ApiFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
