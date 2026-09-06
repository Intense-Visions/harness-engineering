---
schemaVersion: 1
module: 'packages/core/src/validation'
sourceHash: '83cb9becd4f88fa825368b72cfd1c7ecdac8599e792637b2ee73a25c8e537557'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
import { denominate } from '../metrics'
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
