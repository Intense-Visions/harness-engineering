---
schemaVersion: 1
module: 'packages/cli/src/naming-craft'
sourceHash: 'add5e9f07c20b55270b99ea5c1319a85763173cd10b49d48be5b6184638ad58f'
compiledAt: '2026-08-28T01:22:09.272Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

**naming-craft** is an LLM-judgment skill that critiques identifier names (variables, functions, classes) in TypeScript/JavaScript projects against a curated rubric catalog. It powers the first phase of the craft-pipeline initiative.

The module supports two execution modes:

1. **Inline** (`runNamingCraft`): walks the codebase, extracts identifiers, applies each applicable rubric via LLM in one pass, and returns findings immediately. Swallows per-identifier errors so one bad LLM call doesn't sink the run.

2. **In-session** (two-step): `collectNamingCraftPrompts` walks the codebase, builds (identifier, rubric) prompt pairs, persists run-state to disk under `.harness/craft/runs/<runId>.json`, and returns prompts for the calling agent to answer. `finalizeNamingCraft` loads the run-state, processes responses, and builds findings. Enables session-aware orchestration where LLM work is delegated across agent boundaries.

Core flow: extract identifiers and infer project naming convention from a sampled codebase walk → filter identifiers by kind and apply per-file limits → for each identifier, generate one prompt per applicable rubric → (inline) call LLM synchronously or (in-session) collect and persist for agent to answer → parse LLM feedback into `NamingFinding` structs.

## Invariants

- Provider mode enforcement: runNamingCraft rejects InSessionLlmProvider — it requires the two-step flow (collectNamingCraftPrompts + finalizeNamingCraft). This gates callers to the right entrypoint for their execution model.
- Run-state identity: both collect and finalize must reference the same projectRoot and runId. The finalize call loads and validates that the persisted state belongs to skill: 'naming-craft', not another skill, preventing cross-skill deserialization.
- Budget-exceeded early exit: if pending prompts exceed the budget cap (default 100), collectNamingCraftPrompts returns status: 'budget-exceeded' with an empty pendingPrompts array. Callers must check the status flag; an oversized prompt set never ships to the agent.
- Partial finalize guard: finalizeNamingCraft rejects completion when fewer responses are provided than prompts were collected, unless allowPartial: true is passed. This prevents silent partial critiques masquerading as full-scope work.
- filesScanned semantics differ by coverage: full finalize reports the walk count from collection time (includes files yielding no identifiers); partial finalize recomputes it to only count files that were actually critiqued. Callers can trust filesScanned to honestly reflect reach.
- Rubric applicability filtering: each rubric declares appliesTo: IdentifierKind[]. Only matching identifiers are critiqued against that rubric. A function-level naming rubric never runs on variables.
- Deterministic prompt ordering: prompts are collected in stable nested-loop order (files → identifiers per file → rubrics). This order is preserved through run-state for reproducible replay.
- Run-state lifecycle cleanup: pruneOldRuns auto-deletes stale runs before new collection; deleteRunState removes the file after successful finalize. Disk state is never left dangling across runs.

## Interface Contract

```ts
export IdentifierKind
export NamingCraftOutput
export NamingFinding
export ProjectConvention
export collectNamingCraftPrompts
export critiqueNamesInFile
export finalizeNamingCraft
export runNamingCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { NamingRubric, SEED_RUBRICS } from './catalog/rubrics/index.js'
import { sampleConventions } from './extract/convention.js'
import { ExtractedIdentifier, extractIdentifiers } from './extract/identifiers.js'
import { IdentifierKind, NamingCraftOutput, NamingFinding, ProjectConvention } from './findings/schema.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from './llm/provider.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
