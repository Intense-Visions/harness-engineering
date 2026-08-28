---
schemaVersion: 1
module: 'packages/core/src/context'
sourceHash: '75abce14352a9f350df3cf828e1c9109cfea740b19c6c3b6deb210af9ca5da89'
compiledAt: '2026-08-28T01:22:10.371Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

`packages/core/src/context` is a token-and-context-budgeting subsystem for AI agent context consumption. It allocates the nominal context window into six categories (systemPrompt 15%, projectManifest 5%, taskSpec 20%, activeCode 40%, interfaces 10%, reserve 10%) and flags contributors that exceed their share. It classifies context surfaces into three classes—always-loaded (fixed per-turn tax), path-scoped (loaded by working-set path), invoked-only (loaded on-demand)—ranks contributors by token cost, and supports exact counting via Anthropic's API with graceful fallback to a chars÷4 heuristic. It validates AGENTS.md for required sections and link integrity, parses SKILL.md into four progressive-loading levels for deferred content, measures imperative-instruction density against the HumanLayer budget, and monitors resident token consumption within a turn against research-backed trip wires (warn/trip thresholds are window-class-anchored, not percentages).

## Invariants

- Token budget ratios are normalized—allocation functions normalize and enforce minimums to guarantee six categories always sum to 100% of allocable window
- Context class ↔ budget category mapping is fixed 1:1—always-loaded→systemPrompt, path-scoped→projectManifest, invoked-only→interfaces; changing this mapping breaks the entire attribution model
- Section-level classification is exhaustive and stable—SECTION_LEVEL_MAP defines every known H2 heading's progressive-disclosure tier (1–4) and defaults to 3; tier cumulation is strict (level-N includes all N−1 content)
- Window band boundaries are absolute token anchors, never percentages—fixed thresholds (1M: warn 250K/trip 350K; 200K: warn 80K/trip 100K) because % thresholds produce degradation on large windows
- EFFECTIVE_WINDOW_RATIO = 0.6—usable context is ~60% of nominal window per RULER research; trip wires and utilization calculations depend on this constant
- Attribution never hard-fails—buildAttributionReport catches token-counter exceptions per entry and falls back to heuristic; report marks degradation but never throws
- REQUIRED_SECTIONS in AGENTS.md is non-negotiable—validateAgentsMap rejects any validation if a required section is missing; this is load-bearing for agent-capability discovery
- Trip verdicts are keyed to resident token count, not utilization—evaluateContextBudget returns trip when usedTokens ≥ tripAt (absolute), never when a percentage crosses a threshold

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
