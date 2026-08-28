---
schemaVersion: 1
module: 'packages/core/src/validation'
sourceHash: 'ab7b614a7a40e34047f41ea6cb00ab036e756ada912b32e6e8c97308af15871f'
compiledAt: '2026-08-28T01:22:10.723Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'branch.ts',
    'commit-message.ts',
    'config.ts',
    'decisions.test.ts',
    'decisions.ts',
    'file-structure.ts',
    'index.ts',
    'merge-driver.test.ts',
    'merge-driver.ts',
    'pulse.test.ts',
    'pulse.ts',
    'roadmap-aggregate-drift.test.ts',
    'roadmap-aggregate-drift.ts',
    'roadmap-mode.ts',
    'roadmap-read-source.repo.test.ts',
    'roadmap-read-source.test.ts',
    'roadmap-read-source.ts',
    'solutions.test.ts',
    'solutions.ts',
    'strategy.test.ts',
    'strategy.ts',
    'types.ts',
  ]
---

## Summary

packages/core/src/validation is the centralized validation boundary for Harness projects. It enforces conventions and structural rules across agent configs, commits, branch names, decision ADRs, roadmap aggregates, strategy docs, and solutions directories. Each validator follows a consistent Result<T, Error> pattern for composable error handling and helpful diagnostic messages. The module composes lower-level validators (validateConfig wraps Zod schemas, validateCommitMessage enforces conventional commit format) and higher-level orchestrators (validateFileStructure chains branch + commit + decision + strategy checks). It serves as the gatekeeper for harness compliance — tooling like pre-commit hooks, CI checks, and the orchestrator's runAgentConfigFallbackRules depend on its verdicts.

## Invariants

- Result<T, Error> contract: all validators return Result for composability; callers assume consistent error shape with code, message, context, and suggestions.
- Zod schemas are the config ground truth: validateConfig<T>(data, schema) delegates all shape validation to Zod; schema changes flow automatically to all dependent validators without requiring manual test updates.
- Conventional commit strictness: validateCommitMessage accepts only VALID_TYPES (feat/fix/docs/etc.); scope and breaking-change indicators are optional, but type and description are mandatory; the header line must match CONVENTIONAL_PATTERN exactly.
- Branch naming is prefix-based: branches must match prefix/slug where prefix is in the config's allowlist and slug (when enforceKebabCase=true) follows kebab-case rules; ticket IDs (e.g., PROJ-123) are recognized and skip kebab case on the remainder.
- Decision numbers baseline is load-bearing: validateDecisionNumbers compares ADR corpus against .harness/decisions/number-baseline.json; the absence of a baseline means 'not applicable' (no validation), but once it exists, collision detection is mandatory.
- Roadmap read sources are allowlisted: findRoadmapReadSourceViolations enforces ROADMAP_READ_ALLOWLIST to prevent undeclared module references in roadmap definitions; violations block merges via floor gates.
- Validator composition is order-independent: validateFileStructure chains independent validators (branch, commit, decisions, etc.); one validator's failure does not skip others, allowing tooling to report all issues in one pass (fail-open for diagnostics).
- Agent config fallback rules are deterministic: runAgentConfigFallbackRules applies a fixed sequence of rewrites (e.g., model fallback, tier defaults) in a known order; re-running on the same config must be idempotent.

## Interface Contract

```ts
export AgentConfigFallbackReason
export AgentConfigFinding
export AgentConfigOptions
export AgentConfigSeverity
export AgentConfigValidation
export CommitFormat
export CommitValidation
export ConfigError
export Convention
export DecisionNumberCollision
export DecisionNumbersValidation
export PulseConfigValidation
export ROADMAP_READ_ALLOWLIST
export RoadmapAggregateDriftInput
export RoadmapAggregateDriftResult
export RoadmapModeValidationConfig
export SolutionsDirValidation
export StrategyValidation
export StructureValidation
export checkRoadmapAggregateDrift
export findRoadmapReadSourceViolations
export needsMergeOursDriverWarning
export runAgentConfigFallbackRules
export validateAgentConfigs
export validateCommitMessage
export validateConfig
export validateDecisionNumbers
export validateFileStructure
export validatePulseConfig
export validateRoadmapMode
export validateSolutionsDir
export validateStrategy
```

## Dependency Slice

```
import { PulseConfigSchema } from '../pulse/schema'
import { RoadmapModeConfig, getRoadmapMode } from '../roadmap/mode'
import { ValidationError, createError } from '../shared/errors'
import { findFiles } from '../shared/fs-utils'
import { Err, Ok, Result } from '../shared/result'
import { BUG_TRACK_CATEGORIES, KNOWLEDGE_TRACK_CATEGORIES, SolutionDocFrontmatterSchema } from '../solutions/schema'
import { asStrategyDoc, parseStrategyDoc } from '../strategy/parser'
import { StrategyDocSchema } from '../strategy/schema'
import { validateConfig } from './config'
import { validateDecisionNumbers } from './decisions'
import { needsMergeOursDriverWarning } from './merge-driver'
import { validatePulseConfig } from './pulse'
import { checkRoadmapAggregateDrift } from './roadmap-aggregate-drift'
import { findRoadmapReadSourceViolations } from './roadmap-read-source'
import { validateSolutionsDir } from './solutions'
import { validateStrategy } from './strategy'
import { CommitFormat, CommitValidation, ConfigError, Convention, StructureValidation } from './types'
import matter from 'gray-matter'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
