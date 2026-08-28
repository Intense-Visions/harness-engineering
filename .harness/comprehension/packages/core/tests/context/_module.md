---
schemaVersion: 1
module: 'packages/core/tests/context'
sourceHash: '510db5cda804ca1c6928abff85c870f2c78d9e8ffb9a083f9c86e99fab5f0d9e'
compiledAt: '2026-08-28T01:22:10.825Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
