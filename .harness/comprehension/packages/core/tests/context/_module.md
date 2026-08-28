---
schemaVersion: 1
module: 'packages/core/tests/context'
sourceHash: '510db5cda804ca1c6928abff85c870f2c78d9e8ffb9a083f9c86e99fab5f0d9e'
compiledAt: '2026-08-28T01:22:10.825Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'agents-map.test.ts',
    'attribution.test.ts',
    'budget.test.ts',
    'context-budget-trip-wire.test.ts',
    'count-tokens.test.ts',
    'doc-coverage.test.ts',
    'filter.test.ts',
    'generate.test.ts',
    'graph-integration.test.ts',
    'instruction-density.test.ts',
    'knowledge-map.test.ts',
    'progressive-loader.test.ts',
    'section-parser.test.ts',
  ]
---

## Summary

The `packages/core/tests/context` module validates the context management system that allocates and tracks token budgets across different input types. It spans five subsystems: agents-map (parses and validates AGENTS.md documentation, extracts markdown links and sections, detects broken references); attribution (tracks token consumption per context class, flags over-budget entries, degrades to heuristic counting on counter failure); budget (allocates a fixed token window proportionally across six categories: systemPrompt 15%, projectManifest 5%, taskSpec 20%, activeCode 40%, interfaces 10%, reserve 10%); plus progressive-loader, filters, instruction-density, doc-coverage, and knowledge-map (handle load-planning, phase-aware filtering, instruction analysis, and cross-reference validation).

## Invariants

- Budget allocation is proportional and zero-sum: all six categories sum to ≤total window (floor rounding may drop <10 tokens); budget overrides redistribute remainder proportionally and never exceed the total
- Attribution tracks both exact and heuristic counting: exact counters (API-based) preferred; fallback to heuristicTokenCounter (chars÷4) on failure, mark entry degraded, set report counterMode to 'mixed' or 'exact'
- Over-budget flagging is class-scoped: an entry exceeds budget only if its token sum > contextBudget()[CLASS_TO_BUDGET_CATEGORY[class]]; report tracks per-class allocations independently
- Agents map validation is multi-dimensional: must report valid sections, broken links, and total link count as independent properties even when some are empty; return structured Result type with ok/error/value
- Section association is line-aware: extracted markdown links and sections preserve line numbers; links assigned to containing section by descending line order; descriptions capture multi-line prose until next heading
- Doc links are filesystem-relative: path validation resolves links relative to AGENTS.md location; ./missing.md and ./exists.md are distinct checks; non-existent files flag brokenLinks, not missing sections

## Interface Contract

```ts

```

## Dependency Slice

```
import { estimateTokens } from '../../src/compaction/envelope'
import { extractMarkdownLinks, extractSections, validateAgentsMap } from '../../src/context/agents-map'
import { CLASS_TO_BUDGET_CATEGORY, ContextSurfaceEntry, TokenCounter, buildAttributionReport, heuristicTokenCounter } from '../../src/context/attribution'
import * as budgetModule, { contextBudget } from '../../src/context/budget'
import { EFFECTIVE_WINDOW_RATIO, evaluateContextBudget, resolveContextBudgetThresholds } from '../../src/context/context-budget-trip-wire'
import { DEFAULT_COUNT_TOKENS_MODEL, FetchLike, createAnthropicTokenCounter, resolveTokenCounter } from '../../src/context/count-tokens'
import { checkDocCoverage } from '../../src/context/doc-coverage'
import { contextFilter, getPhaseCategories } from '../../src/context/filter'
import { generateAgentsMap } from '../../src/context/generate'
import { DEFAULT_INSTRUCTION_BUDGET, analyzeSkillInstructionDensity, countImperativeInstructions } from '../../src/context/instruction-density'
import { validateKnowledgeMap } from '../../src/context/knowledge-map'
import { DEFAULT_LOADER_CONFIG, computeLoadPlan } from '../../src/context/progressive-loader'
import { extractLevel, parseSections } from '../../src/context/section-parser'
import { skipDirGlobs } from '@harness-engineering/graph'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
