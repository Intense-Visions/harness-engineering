---
schemaVersion: 1
module: 'packages/cli/src/docs-craft'
sourceHash: '7fa11ba31df4bff38ba4081c249af26125455dfcd27cbcbdbc693362f32102e0'
compiledAt: '2026-08-28T01:22:09.132Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

docs-craft is the LLM-judgment ceiling for documentation quality. It discovers docs across a project, classifies them by kind (README, API reference, etc.), applies role-based rubrics via LLM critique, and returns structured findings. Two execution paths: inline (one-call discovery+critique) and in-session (two-step collect/finalize for deferred prompts). A cross-cutting entry critiques single files without full project walks. Core loop: for each discovered doc, determine kind, fetch applicable rubrics, run per-(doc, rubric) critiques, parse findings, accumulate. Errors are absorbed per-(doc, rubric) to allow partial results.

## Invariants

- InSessionLlmProvider is forbidden on inline entries (runDocsCraft, critiqueDocFile) — it throws PromptDeferredError on every call and has no mechanism to collect/finalize deferred prompts; assert upfront
- Two-step flow is stateful and round-tripped — collectDocsCraftPrompts saves run-state (doc+rubric pairs, metadata) keyed by runId; finalizeDocsCraft must load it with same runId; state is deleted on success
- Prompt budget is a hard guard — collectDocsCraftPrompts projects prompt count and bails early (status='budget-exceeded') if exceeding budget (default 100); prevents unbounded LLM cost
- Doc kind drives rubric selection — classifyDoc determines kind; rubricsForKind returns applicable rubrics; one doc → one kind → N rubrics → N prompts
- Per-(doc, rubric) errors are absorbed — both inline and cross-cutting paths swallow catch blocks on LLM failures; failed critique produces no finding; designed for partial results
- Finding parsing is all-or-nothing — parseFindingFromRaw returns null on failure; null findings dropped silently; only successfully-parsed findings reach output
- File-read errors are counted, not fatal — fs.readFileSync failures (permission/deletion race) increment filesSkipped and continue; tool degrades gracefully
- Run summary always stamped even on zero findings — buildSummary emits metadata (rubrics applied, exemplars available, files scanned/skipped, LLM cost); observability contract for callers

## Interface Contract

```ts
export DOCS_ROOT
export DiscoveredDoc
export DocKind
export DocsCraftOutput
export DocsExemplar
export DocsFinding
export DocsRubric
export SEED_EXEMPLARS
export collectDocsCraftPrompts
export critiqueDocFile
export finalizeDocsCraft
export runDocsCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js'
import { DocKind, SEED_RUBRICS, rubricsForKind } from './catalog/rubrics/index.js'
import { DiscoveredDoc, classifyDoc, discoverDocs } from './extract/discover.js'
import { DocsCraftOutput, DocsFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
