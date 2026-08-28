---
schemaVersion: 1
module: 'packages/cli/src/code-craft'
sourceHash: 'e633b351d55b1f2b20d5bc3be281863a11690165b23762fadf082013f734e90c'
compiledAt: '2026-08-28T01:22:08.755Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

`code-craft` is the LLM-judgment ceiling skill for code quality, complementing harness's rule-based floor (entropy-cleaner, architecture enforcement, complexity checks). It walks a project's source files, extracts substantive units (functions, methods, classes), and critiques each against a kind-filtered catalog of rubrics—avoiding FP cost by skipping files with no units and applying only relevant rules per unit type.

The module supports two operational flows: (1) **Inline** (fast): Direct LLM critique via the provider, returns findings immediately. Requires a stateless LLM provider. (2) **In-session** (two-step): Collects prompts → persists run state to disk → lets the calling agent supply LLM responses → finalizes and reconstructs findings. Enables agent-driven LLM integration.

The core loop reads each file, extracts units via AST parsing, filters rubrics by unit kind, builds one prompt per (unit, rubric) pair, and either calls the LLM directly (inline) or queues for the agent (in-session). Findings are rendered with file, line, rubric ID, and explanation. Identifier-level naming critiques are delegated to `naming-craft`; `code-craft` fires only on signature-shape mismatches.

## Invariants

- Path consistency across collect/finalize — projectRoot is the disk key for run-state lookup; mismatched paths silently fail to load state, breaking reconstruction.
- Rubric-kind filtering is mandatory — rubricApplies() gates which rubrics apply to which unit kinds; skipping this check generates spurious findings and unbounded LLM cost.
- Budget guard on prompt collection — Projected prompt count capped before exceeding the budget; exceeded → early return with hint rather than proceeding to overflow.
- Provider type gates the flow — runCodeCraft forbids InSessionLlmProvider; inline requires a stateless provider. Mixing provider type + flow throws early.
- Run state is the source of truth — All finding reconstruction depends on persisted CodeRunMeta.prompts metadata; loss of the run file = loss of the ability to finalize.
- Prompt ID is the join key — Responses matched to units + rubrics via promptId; ID stability required across collection/finalization; orphaned responses silently skipped.
- No-unit files are skipped — Files with zero substantive units contribute no findings and no telemetry noise; extractUnits([]) → skip, not error.
- Error isolation per (unit, rubric) — LLM critique errors or parse failures on one pair don't cascade; swallowed per-pair so partial runs still succeed.

## Interface Contract

```ts
export CodeCraftOutput
export CodeExemplar
export CodeFinding
export CodeRubric
export CodeUnit
export SEED_EXEMPLARS
export SEED_RUBRICS
export UnitKind
export collectCodeCraftPrompts
export critiqueCodeInFile
export critiqueNamesInFile
export finalizeCodeCraft
export runCodeCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js'
import { CodeRubric, SEED_RUBRICS, rubricApplies } from './catalog/rubrics/index.js'
import { discoverSourceFiles } from './extract/discover.js'
import { extractUnits } from './extract/units.js'
import { CodeCraftOutput, CodeFinding, CodeUnit } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
```
