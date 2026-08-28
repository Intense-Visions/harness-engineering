---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft'
sourceHash: '75d7b22bc78e8901347f5810f163e404c672e90cf3ddf856520773f998500af3'
compiledAt: '2026-08-28T01:22:09.228Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

**knowledge-craft** is an LLM-judgment skill that audits knowledge-entry quality across `docs/knowledge/`. It discovers markdown entries, applies a curated rubric catalog to each file, and surfaces findings (schema violations, clarity gaps, structural issues). The module supports two execution flows: inline mode (`runKnowledgeCraft`) for single-call orchestration with immediate LLM judgment, and in-session mode (two-step `collectKnowledgeCraftPrompts` + `finalizeKnowledgeCraft`) that decouples discovery/prompt building from LLM judgment for agent delegation.

## Invariants

- runKnowledgeCraft must upfront reject InSessionLlmProvider — it has no collect/finalize flow to handle deferred prompts; only collectKnowledgeCraftPrompts accepts that provider
- Input maxFiles must be validated as non-negative finite; negative values trigger JS negative-index slice (silently drops trailing files); NaN/Infinity are invalid; falls back to DEFAULT_MAX_FILES=50
- collectKnowledgeCraftPrompts enforces a hard prompt budget (default 100); once exceeded, returns 'budget-exceeded' status and refuses to proceed, preventing unbounded cost projection
- Collect writes KnowledgeRunMeta to .harness/craft/runs/<runId>.json; finalize reads and validates it; success deletes the file; the state is ephemeral per run
- All rubrics must come from a single SEED_RUBRICS immutable set; finalize looks up rubrics by id using the same seed; missing rubricId references are silently skipped for safe partial success
- Per-(file, rubric) critique errors are silently swallowed to allow partial success; only file-read failures increment filesSkipped; a single bad rubric or LLM call does not abort the run
- Inline mode sums LLM spend via provider.getCosts() (if present); in-session finalize hardcodes costUsd=0 and counts only responses supplied, never querying the provider

## Interface Contract

```ts
export DiscoveredEntry
export KnowledgeCraftOutput
export KnowledgeFinding
export KnowledgeRubric
export collectKnowledgeCraftPrompts
export critiqueKnowledgeFile
export finalizeKnowledgeCraft
export runKnowledgeCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { KnowledgeRubric, SEED_RUBRICS } from './catalog/rubrics/index.js'
import { DiscoveredEntry, KNOWLEDGE_ROOT, discoverKnowledgeEntries } from './extract/discover.js'
import { KnowledgeCraftOutput, KnowledgeFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
