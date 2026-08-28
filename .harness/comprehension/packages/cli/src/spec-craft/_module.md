---
schemaVersion: 1
module: 'packages/cli/src/spec-craft'
sourceHash: '6101c98743983161b84f9213ddb3c204c418ef4b06bab9ffb1b504f1528947a4'
compiledAt: '2026-08-28T01:22:09.358Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

spec-craft is an LLM-powered quality-critique skill that evaluates specification documents (proposals and ADRs) against seven seed rubrics. It discovers specs from `docs/changes/**/proposal.md` and `docs/knowledge/decisions/*.md`, parses them into H2-delimited sections, applies matching rubrics to each section, and returns findings rated on three axes (Tier/Impact/Confidence). The module supports both inline (single call via `runSpecCraft`) and in-session (two-step `collectSpecCraftPrompts` → `finalizeSpecCraft`) execution modes, with upfront prompt budgeting (default 100) to prevent cost overruns.

## Invariants

- InSessionLlmProvider is rejected upfront from runSpecCraft (inline entry) — all in-session work must use the two-step flow. A bare catch {} swallowing PromptDeferredError would produce false-negative zero-findings runs (#1368).
- Run state must round-trip: collectSpecCraftPrompts saves SpecRunMeta (prompts array with promptId → file/section/rubricId mapping) to disk; finalizeSpecCraft loads it via loadRunStateOrThrow using runId as key. Lookup failure throws.
- Rubric application is deterministic: rubricApplies() matches section canonical names (lowercase, hyphenated) against matcher list (string/regex/wildcard). A non-matching rubric produces zero cost and zero finding for that pair.
- Section parsing offset depends on frontmatter: parseSections() strips YAML frontmatter before splitting lines; section.line counts from the stripped result. Frontmatter presence shifts offsets.
- Finding parser is shared truth: parseFindingFromRaw() is pure (no LLM), used by both inline and in-session paths. JSON shape, tier/impact/confidence enum validation, and message presence checks live here.
- Prompt budget stops runaway costs: collectSpecCraftPrompts aborts immediately if pending.length > budget (default 100), returning a hint with reduction advice before any prompts leave the function.
- Per-(section, rubric) errors are silent: critiqueOne() errors are caught and swallowed in both runSpecCraft and critiqueSpecFile. If all rubrics fail for a section, that section contributes zero findings.
- File kind classifier uses path segments: isUnderDecisionsDir() splits paths on both path.sep and POSIX / to normalize CLI input. 'decisions' in segment list = ADR; otherwise proposal.

## Interface Contract

```ts
export DiscoveredSpec
export SpecCraftOutput
export SpecFinding
export SpecKind
export collectSpecCraftPrompts
export critiqueSpecFile
export finalizeSpecCraft
export runSpecCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_RUBRICS, SpecRubric, rubricApplies } from './catalog/rubrics/index.js'
import { DiscoveredSpec, SpecKind, discoverSpecs } from './extract/discover.js'
import { parseSections } from './extract/sections.js'
import { SpecCraftOutput, SpecFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
```
