---
schemaVersion: 1
module: 'packages/cli/src/security-craft'
sourceHash: '95235fe18c27ebc89a9a378785b2c93f8f89fd6f883abe0e03cd7c7f0147cbd1'
compiledAt: '2026-08-28T01:22:09.323Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

security-craft is the security-analysis orchestrator within the craft-pipeline initiative. It walks source trees, detects AST-driven security signals, applies rubrics to filter matches, and critiques findings using LLM reasoning. It supports both inline (one-step, direct LLM calls) and in-session (two-step, deferred-prompt) modes, with disk-backed run-state for async flows. The module guards against explosion via prompt budgets and file/signal caps, swallows per-critique errors to preserve partial runs, and skips files with no signals entirely.

## Invariants

- Inline entry points assert the provider can answer—they refuse InSessionLlmProvider to prevent silent zero-finding runs from swallowed deferred errors
- In-session flow requires disk-backed run-state; each prompt is paired to its signal/file/rubric context; finalize deletes state on success
- collectSecurityCraftPrompts caps pending prompts at budget limit; exceeding budget bails with projection hint rather than queuing unbounded LLM calls
- Only rubrics matching a signal's kind are critiqued; mismatched pairs are skipped
- Per-(signal, rubric) failures are caught and discarded; partial runs are preserved (missing critique > losing whole run)
- Files with zero detected signals are silently skipped and counted separately (intentional FP management)
- Run-state is deleted after finalize succeeds, ensuring idempotent re-runs and preventing stale state accumulation
- maxSignalsPerFile and maxFiles limits are hard truncation points; exceeding either silently caps the work list

## Interface Contract

```ts
export SecurityCraftOutput
export SecurityFinding
export SecurityRubric
export SecuritySignal
export SignalKind
export collectSecurityCraftPrompts
export critiqueSecurityInFile
export finalizeSecurityCraft
export runSecurityCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_RUBRICS, SecurityRubric, rubricApplies } from './catalog/rubrics/index.js'
import { discoverSourceFiles } from './extract/discover.js'
import { detectSignals } from './extract/signals.js'
import { SecurityCraftOutput, SecurityFinding, SecuritySignal } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
```
