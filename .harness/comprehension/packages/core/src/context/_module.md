---
schemaVersion: 1
module: 'packages/core/src/context'
sourceHash: '0c7f206b64d9c19e93bfdcdd3304f099ca2ff105248660b1228729346bb1f2f8'
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
    'refinement-demand.ts',
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
export ClassDemand
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
export OPERATION_CONTEXT_CLASS
export ParsedSection
export REFINEMENT_CONTEXT_CLASSES
export REQUIRED_SECTIONS
export RefinementContextClass
export RefinementDemandReport
export RefinementOperation
export RefinementRequest
export ResolvedCounterMode
export ResolvedTokenCounter
export SkillInstructionDensityReport
export SkillLoadPlan
export TokenBudget
export TokenBudgetOverrides
export TokenCounter
export WorkflowPhase
export aggregateDemand
export analyzeSkillInstructionDensity
export buildAttributionReport
export checkDocCoverage
export classifyRefinement
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
