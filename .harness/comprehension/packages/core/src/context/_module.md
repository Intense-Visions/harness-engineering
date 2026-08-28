---
schemaVersion: 1
module: 'packages/core/src/context'
sourceHash: '75abce14352a9f350df3cf828e1c9109cfea740b19c6c3b6deb210af9ca5da89'
compiledAt: '2026-08-28T01:22:10.371Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agents-map.ts',
    'attribution.ts',
    'budget.ts',
    'budget.types.ts',
    'context-budget-trip-wire.ts',
    'count-tokens.ts',
    'doc-coverage.ts',
    'filter.ts',
    'filter.types.ts',
    'generate.ts',
    'index.ts',
    'instruction-density.ts',
    'knowledge-map.ts',
    'progressive-loader.ts',
    'section-parser.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export AgentMapLink
export AgentMapSection
export AgentMapValidation
export AgentsMapConfig
export AnthropicTokenCounterOptions
export AttributedContributor
export AttributionReport
export BrokenLink
export BuildAttributionReportOptions
export CLASS_TO_BUDGET_CATEGORY
export CONTEXT_CLASSES
export ClassAttribution
export ContextBudgetEvaluation
export ContextBudgetThresholds
export ContextBudgetVerdict
export ContextClass
export ContextFilterResult
export ContextSurfaceEntry
export ContextWindowBand
export CounterMode
export CoverageOptions
export CoverageReport
export DEFAULT_COUNT_TOKENS_MODEL
export DEFAULT_INSTRUCTION_BUDGET
export DEFAULT_LOADER_CONFIG
export DocumentationGap
export EFFECTIVE_WINDOW_RATIO
export FetchLike
export FileCategory
export GenerationSection
export GraphCoverageData
export IntegrityReport
export LevelInstructionDensity
export LoaderConfig
export ParsedSection
export REQUIRED_SECTIONS
export ResolvedCounterMode
export ResolvedTokenCounter
export SkillInstructionDensityReport
export SkillLoadPlan
export TokenBudget
export TokenBudgetOverrides
export TokenCounter
export WorkflowPhase
export analyzeSkillInstructionDensity
export buildAttributionReport
export checkDocCoverage
export computeLoadPlan
export contextBudget
export contextFilter
export countImperativeInstructions
export createAnthropicTokenCounter
export evaluateContextBudget
export extractLevel
export extractMarkdownLinks
export extractSections
export generateAgentsMap
export getPhaseCategories
export heuristicTokenCounter
export parseSections
export resolveContextBudgetThresholds
export resolveTokenCounter
export validateAgentsMap
export validateKnowledgeMap
```

## Dependency Slice

```
import { estimateTokens } from '../compaction/envelope'
import { ContextError, createError } from '../shared/errors'
import { fileExists, findFiles, readFileContent, relativePosix } from '../shared/fs-utils'
import { Err, Ok, Result } from '../shared/result'
import { extractMarkdownLinks, validateAgentsMap } from './agents-map'
import { TokenCounter, heuristicTokenCounter } from './attribution'
import { contextBudget } from './budget'
import { TokenBudget, TokenBudgetOverrides } from './budget.types'
import { ContextFilterResult, FileCategory, WorkflowPhase } from './filter.types'
import { extractLevel, parseSections } from './section-parser'
import { AgentMapLink, AgentMapSection, AgentMapValidation, AgentsMapConfig, BrokenLink, CoverageOptions, CoverageReport, DocumentationGap, GenerationSection, IntegrityReport, REQUIRED_SECTIONS } from './types'
import { LoadingLevel, SkillContextBudget } from '@harness-engineering/types'
import { minimatch } from 'minimatch'
import { basename, dirname, join } from 'path'
```
