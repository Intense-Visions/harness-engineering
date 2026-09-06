---
schemaVersion: 1
module: 'packages/cli/tests/skill'
sourceHash: '25b08e83d3a9c91db313f77df77ee1acd5bbbba339f0d07507683352e34f8ea5'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'bugfleet-index-tier-overrides-cache.test.ts',
    'bugfleet-skills-md-empty-reason-row.test.ts',
    'capabilities.test.ts',
    'complexity-extra.test.ts',
    'complexity.test.ts',
    'content-matcher.test.ts',
    'dispatch-engine.test.ts',
    'dispatch-session.test.ts',
    'dispatch-types.test.ts',
    'dispatcher.perf.test.ts',
    'dispatcher.test.ts',
    'harness-capabilities-seed.test.ts',
    'health-snapshot-types.test.ts',
    'health-snapshot.test.ts',
    'index-builder-extra.test.ts',
    'index-builder.test.ts',
    'package-json.test.ts',
    'pipeline-integration.test.ts',
    'preamble.test.ts',
    'recommendation-engine.test.ts',
    'recommendation-rules.test.ts',
    'recommendation-types.test.ts',
    'schema.test.ts',
    'signal-extractor.test.ts',
    'stack-profile.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { buildPreamble } from '../../src/commands/skill/preamble'
import { isHarnessAuthoredSkill } from '../../src/commands/skill/validate'
import { detectComplexity, evaluateSignals } from '../../src/skill/complexity'
import { ContentMatchResult, ContentSignals } from '../../src/skill/content-matcher-types.js'
import { classifyTier, computeDomainMatch, computeKeywordOverlap, computeStackMatch, computeTermOverlap, inferWhen, matchContent, scoreSkillByContent } from '../../src/skill/content-matcher.js'
import { SIGNAL_CATEGORIES, buildDiffInfoFromGit, computeEstimatedImpact, computeParallelSafe, dispatchSkills, dispatchSkillsFromGit, enrichSnapshotForDispatch, getChangedFiles, getLatestCommitMessage, getSignalCategory, parseNewFilesOutput, parseNumstatOutput } from '../../src/skill/dispatch-engine'
import { dispatchSkillsFromGit } from '../../src/skill/dispatch-engine.js'
import { detectHeadDelta, formatDispatchBanner, getCurrentHead, readLastHead, sessionStartDispatch, writeLastHead } from '../../src/skill/dispatch-session.js'
import { DispatchContext, DispatchResult, DispatchedSkill } from '../../src/skill/dispatch-types'
import { computeHealthScore, formatSuggestions, isTier1Skill, scoreSkill, suggest } from '../../src/skill/dispatcher'
import { HealthChecks, HealthMetrics, HealthSnapshot, deriveSignals, isSnapshotFresh, loadCachedSnapshot, mockCaptureHealthSnapshot, mockIsSnapshotFresh, mockLoadCachedSnapshot, saveCachedSnapshot } from '../../src/skill/health-snapshot'
import { SkillIndexEntry, SkillsIndex, buildIndex, computeSkillsDirHash, loadOrRebuildIndex } from '../../src/skill/index-builder'
import { SkillIndexEntry, SkillsIndex } from '../../src/skill/index-builder.js'
import { derivePackageJson } from '../../src/skill/package-json'
import { buildSkillAddressIndex, matchHardRules, recommend, resolveMetricValue, scoreByHealth, sequenceRecommendations } from '../../src/skill/recommendation-engine'
import { FALLBACK_RULES } from '../../src/skill/recommendation-rules'
import { CHANGE_SIGNALS, DOMAIN_SIGNALS, HEALTH_SIGNALS, HealthSignal, KnowledgeRecommendation, Recommendation, RecommendationResult } from '../../src/skill/recommendation-types'
import { FILESYSTEM_LEVELS, SkillAddress, SkillCapabilitiesSchema, SkillMetadataSchema, capabilityDriftErrors, capabilityRoleErrors, deriveCapabilities } from '../../src/skill/schema'
import { detectStackFromDeps, extractSignals, extractSpecKeywords, inferDomain, simpleStem } from '../../src/skill/signal-extractor.js'
import { generateSkillsMd, parseSkillsMd } from '../../src/skill/skills-md-writer.js'
import { StackProfile, detectDomainsFromFiles, generateStackProfile, loadOrGenerateProfile } from '../../src/skill/stack-profile'
import { SkillsDirWithSource, resolveAllSkillsDirsWithSource } from '../../src/utils/paths'
import { HEALTH_SIGNAL_NAMES, SIGNAL_CATEGORY_MAP, reconcilePassed } from '@harness-engineering/core'
import { realExecSync } from 'child_process'
import * as fs from 'fs'
import { execSync } from 'node:child_process'
import * as fs, fs from 'node:fs'
import * as os from 'node:os'
import * as path, path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
```
