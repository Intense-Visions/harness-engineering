---
schemaVersion: 1
module: 'packages/cli/src/copy-craft'
sourceHash: 'f6d1ab46251c9f0a3e6f2f050a4cc2fa2ec9c8582c52d3baa28ab67d6646540e'
compiledAt: '2026-08-28T01:22:08.935Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

**copy-craft** is an LLM-powered prose-critique skill that scans a codebase for writing quality issues across six surfaces: error messages, log text, CLI output, commit subjects, PR descriptions, and code comments. It applies a catalog of rubrics (style rules) to extracted copy items and returns structured findings.

The module supports two execution modes: (1) **Inline** (`runCopyCraft`) orchestrates gather → critique → return synchronously using a live LLM provider; (2) **In-session** (`collectCopyCraftPrompts` + `finalizeCopyCraft`) defers prompts to the calling agent, then finalizes with responses. Both paths share the same `gatherCopyItems` logic to ensure identical critique scope. A `CopyRunMeta` struct persists run state to disk to bridge the collect/finalize gap. A hard prompt budget (default 100) prevents runaway enumeration.

## Invariants

- gatherCopyItems is the canonical enumeration — both inline and in-session paths must call this function verbatim to build identical (item, rubric) pairs; divergence breaks cross-mode symmetry
- Provider check is fail-closed — assertProviderCanAnswer rejects InSessionLlmProvider in inline mode upfront, throwing rather than silently failing with zero findings (issue #1368)
- CopyRunMeta is the collect/finalize bridge — every prompt record maps promptId → (item, rubricId); omitting or truncating CopyRunMeta.prompts breaks finalize
- Prompt budget is a hard ceiling — if pending.length > DEFAULT_PROMPT_BUDGET, collect returns status='budget-exceeded'; silently capping or truncating the prompt list violates the contract
- Rubric application is surface-specific — rubricApplies(rubric, surface) gates the (item, rubric) cartesian product; not all rubrics apply to all surfaces
- Source extraction respects SOURCE_EXTENSIONS — only .ts, .tsx, .js, .jsx files are scanned for source-side surfaces; git-backed surfaces use separate limits (commitsSince, prLimit)
- Cost tracking binds to provider — inline mode calls LLM (nonzero costUsd); in-session mode does not (costUsd: 0); swapping these breaks cost accounting
- Run state is ephemeral — pruneOldRuns clears stale runs on collect; deleteRunState clears the run file on finalize success; leaving orphaned state skews subsequent runs

## Interface Contract

```ts
export CopyCraftOutput
export CopyFinding
export CopySurface
export collectCopyCraftPrompts
export critiqueCopyInFile
export finalizeCopyCraft
export runCopyCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { CopyRubric, SEED_RUBRICS, rubricApplies } from './catalog/rubrics/index.js'
import { extractCommits } from './extract/commits.js'
import { extractPRDescriptions } from './extract/pr-descriptions.js'
import { extractFromSource } from './extract/source.js'
import { CopyCraftOutput, CopyFinding, CopySurface, ExtractedCopyItem } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
