---
schemaVersion: 1
module: 'packages/cli/src/skill'
sourceHash: '72b04c0ed5a159c340c21df0c9382ca5a0e754b920c64518d0b17cee4927f44e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'complexity.ts',
    'content-matcher-types.ts',
    'content-matcher.ts',
    'dispatch-engine.ts',
    'dispatch-session.ts',
    'dispatch-types.ts',
    'dispatcher.ts',
    'health-snapshot.test.ts',
    'health-snapshot.ts',
    'index-builder.ts',
    'package-json.ts',
    'recommendation-engine.ts',
    'recommendation-rules.ts',
    'recommendation-types.ts',
    'schema.ts',
    'signal-extractor.ts',
    'skills-md-writer.ts',
    'stack-profile.ts',
  ]
---

## Interface Contract

```ts
export ALLOWED_COGNITIVE_MODES
export ALLOWED_PLATFORMS
export ALLOWED_TRIGGERS
export CHANGE_SIGNALS
export DOMAIN_KEYWORD_MAP
export DOMAIN_SIGNALS
export FALLBACK_RULES
export FILESYSTEM_LEVELS
export HEALTH_SIGNALS
export REWORK_ATTENTION_THRESHOLD
export SCORING_WEIGHTS
export SIGNAL_CATEGORIES
export SkillAddressSchema
export SkillCapabilitiesSchema
export SkillCapabilityRolesSchema
export SkillContextBudgetSchema
export SkillMetadataSchema
export TIER_THRESHOLDS
export ZERO_METRICS
export buildDiffInfoFromGit
export buildIndex
export buildSkillAddressIndex
export capabilityDriftErrors
export capabilityRoleErrors
export captureHealthSnapshot
export classifyTier
export computeDomainMatch
export computeEstimatedImpact
export computeHealthScore
export computeKeywordOverlap
export computeParallelSafe
export computeSkillsDirHash
export computeStackMatch
export computeTermOverlap
export deriveCapabilities
export derivePackageJson
export deriveSignals
export detectComplexity
export detectDomainsFromFiles
export detectHeadDelta
export detectStackFromDeps
export dispatchSkills
export dispatchSkillsFromGit
export enrichSnapshotForDispatch
export evaluateSignals
export extractSignals
export extractSpecKeywords
export formatDispatchBanner
export formatSuggestions
export generateSkillsMd
export generateStackProfile
export getChangedFiles
export getCurrentHead
export getLatestCommitMessage
export getSignalCategory
export inferDomain
export inferWhen
export isSnapshotFresh
export isTier1Skill
export loadCachedSnapshot
export loadOrGenerateProfile
export loadOrRebuildIndex
export matchContent
export matchHardRules
export parseNewFilesOutput
export parseNumstatOutput
export parseSkillsMd
export readLastHead
export recommend
export resolveMetricValue
export runGraphMetrics
export runHealthChecks
export runReworkMetrics
export saveCachedSnapshot
export scoreByHealth
export scoreSkill
export scoreSkillByContent
export sequenceRecommendations
export sessionStartDispatch
export simpleStem
export suggest
export writeLastHead
```

## Dependency Slice

```
import from '../mcp/tools/architecture.js'
import from '../mcp/tools/assess-project.js'
import from '../mcp/tools/entropy.js'
import from '../mcp/tools/security.js'
import from '../mcp/utils/graph-loader.js'
import { logger } from '../output/logger'
import { resolveAllSkillsDirsWithSource } from '../utils/paths.js'
import { ContentMatchResult, ContentSignals, DOMAIN_KEYWORD_MAP, SCORING_WEIGHTS, SkillMatch, SkillMatchTier, TIER_THRESHOLDS } from './content-matcher-types.js'
import { dispatchSkillsFromGit } from './dispatch-engine.js'
import { DispatchContext, DispatchResult, DispatchedSkill } from './dispatch-types.js'
import { HealthChecks, HealthMetrics, ZERO_METRICS, captureHealthSnapshot, deriveSignals } from './health-snapshot'
import { HealthMetrics, HealthSnapshot, captureHealthSnapshot, isSnapshotFresh, loadCachedSnapshot } from './health-snapshot.js'
import { SkillIndexEntry, SkillsIndex } from './index-builder.js'
import { buildSkillAddressIndex, recommend } from './recommendation-engine.js'
import { FALLBACK_RULES } from './recommendation-rules.js'
import { Recommendation, RecommendationResult, RecommendationUrgency } from './recommendation-types.js'
import { SkillAddress, SkillMetadataSchema } from './schema.js'
import { simpleStem } from './signal-extractor.js'
import { StackProfile, detectDomainsFromFiles } from './stack-profile.js'
import { ChangeType, DiffInfo, HEALTH_SIGNAL_NAMES, SIGNAL_CATEGORY_MAP, SignalName, detectChangeType, reconcilePassed } from '@harness-engineering/core'
import from '@harness-engineering/graph'
import { execFileSync, execSync } from 'child_process'
import * as fs from 'fs'
import { minimatch } from 'minimatch'
import { execFileSync, execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs, { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { dirname, join } from 'node:path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { z } from 'zod'
```
