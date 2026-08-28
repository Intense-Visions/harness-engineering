---
schemaVersion: 1
module: 'packages/cli/src/skill'
sourceHash: 'e53e235aa310f5199b1f42a18536077e2c11c1729e86d3c38771756f5c7cd519'
compiledAt: '2026-08-28T01:22:09.410Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'complexity.ts',
    'content-matcher-types.ts',
    'content-matcher.ts',
    'dispatch-engine.ts',
    'dispatch-session.ts',
    'dispatch-types.ts',
    'dispatcher.ts',
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

## Summary

`packages/cli/src/skill` is an intelligent skill recommendation and dispatch engine that routes the right workflow skills to development tasks based on codebase health, git context, and semantic signals. It operates in three phases: (1) indexing all available skills and building a searchable catalog, (2) capturing health snapshots of the codebase (dependency structure, test coverage, security posture, etc.), and (3) recommending and dispatching skills by matching them to active health signals and change context. Skills are scored via multi-factor content matching (keyword overlap, stack alignment, term overlap, domain inference), then ranked by a three-layer recommendation system: hard address matching for critical signals, health-weighted scoring for soft matches, and topological sequencing to respect dependencies. Only Tier 1 skills (brainstorm, planning, execution, autopilot, tdd, debugging, refactoring) trigger automated dispatch; all others are retrieved via query APIs.

## Invariants

- Skill index staleness is hash-based: mtime hash across all skill.yaml files drives rebuild; if no skill files changed, index never rebuilds even if recommendation logic changes.
- Single source of truth for domain keywords: DOMAIN_KEYWORD_MAP is shared between signal-extractor and content-matcher; drift between them breaks domain matching and will not be caught by tests.
- Health snapshot freshness depends on git HEAD: Snapshot is considered fresh if git HEAD matches capturedAt; if git HEAD moves but no rebuild happens, stale snapshot may fire wrong skills.
- Fallback rules are hardcoded backstop: Skills with empty addresses in skill.yaml fall back to hardcoded FALLBACK_RULES; a skill deployed with no addresses + no fallback entry will score zero on health signals.
- Only Tier 1 hardcoded skills dispatch: The set {brainstorm, planning, execution, autopilot, tdd, debugging, refactoring} is the ONLY dispatch trigger set; adding a new skill requires adding to this hardcoded set.
- Scoring weights sum to 1.0: Keyword (0.35), Stack (0.25), TermOverlap (0.25), Domain (0.15); if weights are changed without validation, composite scores calibrate incorrectly and tier thresholds (0.6 / 0.35 / 0.15) will misfire.
- Topological sort enforces dependency order: Skills with dependsOn must appear after their dependencies in the dispatch sequence; if sort fails or is omitted, dependent skills may run before their prerequisites.
- Parallelism safety requires non-overlapping addresses: Two skills can run in parallel only if their address signal categories do not overlap; if this check is skipped, signals may be consumed twice.
- Skill-declared addresses override fallback rules: Skill.yaml addresses takes precedence over FALLBACK_RULES; if both exist, fallback is ignored and the skill definition is canonical.
- Context budget is advisory, not enforced: Skills declare contextBudget.maxTokens and priority, but the recommendation engine ranks by it; there is no hard circuit breaker that rejects over-budget recommendations.

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
export SCORING_WEIGHTS
export SIGNAL_CATEGORIES
export SkillAddressSchema
export SkillCapabilitiesSchema
export SkillCapabilityRolesSchema
export SkillContextBudgetSchema
export SkillMetadataSchema
export TIER_THRESHOLDS
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
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import * as path from 'path'
import { parse } from 'yaml'
import { z } from 'zod'
```
