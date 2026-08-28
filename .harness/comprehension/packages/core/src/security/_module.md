---
schemaVersion: 1
module: 'packages/core/src/security'
sourceHash: '6afe1008f6427474be62d25923cf180fd85ebf0b25ec0616625319b4fdc32e33'
compiledAt: '2026-08-28T01:22:10.592Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config.ts',
    'harness-ignore.ts',
    'index.ts',
    'injection-patterns.ts',
    'osv-client.ts',
    'scan-config-shared.test.ts',
    'scan-config-shared.ts',
    'scan-targets.ts',
    'scanner.ts',
    'secret-reference.ts',
    'security-timeline-manager.ts',
    'security-timeline-types.ts',
    'stack-detector.ts',
    'taint.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export DEFAULT_SECURITY_CONFIG
export DESTRUCTIVE_BASH
export EMPTY_SUPPLY_CHAIN
export FindingLifecycle
export FindingLifecycleSchema
export InjectionFinding
export InjectionPattern
export InjectionSeverity
export OsvAdvisory
export OsvCheckResult
export OsvClient
export OsvClientOptions
export OsvPackageRef
export RuleOverride
export RuleRegistry
export SECURITY_SCAN_DEFAULT_IGNORE
export SECURITY_SCAN_EXTENSIONS
export SECURITY_SCAN_GLOB
export ScanConfigFileResult
export ScanConfigFinding
export ScanConfigResult
export ScanResult
export SecurityCategory
export SecurityCategorySnapshot
export SecurityCategorySnapshotSchema
export SecurityConfidence
export SecurityConfig
export SecurityConfigSchema
export SecurityDirection
export SecurityDirectionSchema
export SecurityFinding
export SecurityRule
export SecurityScanner
export SecuritySeverity
export SecurityTimelineFile
export SecurityTimelineFileSchema
export SecurityTimelineManager
export SecurityTimelineSnapshot
export SecurityTimelineSnapshotSchema
export SecurityTrendLine
export SecurityTrendLineSchema
export SecurityTrendResult
export SecurityTrendResultSchema
export SupplyChainSnapshot
export SupplyChainSnapshotSchema
export SuppressionRecord
export TaintCheckResult
export TaintFinding
export TaintState
export TimeToFixResult
export TimeToFixResultSchema
export TimeToFixStats
export TimeToFixStatsSchema
export TrendAttribution
export TrendAttributionSchema
export agentConfigRules
export checkTaint
export clearTaint
export computeOverallSeverity
export computeScanExitCode
export createOsvClient
export cryptoRules
export deserializationRules
export detectStack
export expressRules
export getInjectionPatterns
export getTaintFilePath
export goRules
export injectionRules
export insecureDefaultsRules
export isDuplicateFinding
export listTaintedSessions
export mapInjectionFindings
export mapSecurityFindings
export mapSecuritySeverity
export mcpRules
export networkRules
export nodeRules
export parseHarnessIgnore
export parseSecurityConfig
export pathTraversalRules
export reactRules
export readTaint
export resolveRuleSeverity
export scanForInjection
export secretRules
export securityFindingId
export sharpEdgesRules
export writeTaint
export xssRules
```

## Dependency Slice

```
import { resolveRuleSeverity } from './config'
import { parseHarnessIgnore } from './harness-ignore'
import { InjectionFinding } from './injection-patterns'
import { agentConfigRules } from './rules/agent-config'
import { cryptoRules } from './rules/crypto'
import { deserializationRules } from './rules/deserialization'
import { injectionRules } from './rules/injection'
import { insecureDefaultsRules } from './rules/insecure-defaults'
import { mcpRules } from './rules/mcp'
import { networkRules } from './rules/network'
import { pathTraversalRules } from './rules/path-traversal'
import { RuleRegistry } from './rules/registry'
import { secretRules } from './rules/secrets'
import { sharpEdgesRules } from './rules/sharp-edges'
import { expressRules } from './rules/stack/express'
import { goRules } from './rules/stack/go'
import { nodeRules } from './rules/stack/node'
import { reactRules } from './rules/stack/react'
import { xssRules } from './rules/xss'
import { ScanConfigFileResult, ScanConfigFinding, computeOverallSeverity, computeScanExitCode, isDuplicateFinding, mapInjectionFindings, mapSecurityFindings, mapSecuritySeverity } from './scan-config-shared'
import { extractQuotedSecretValue, isReferenceOnlySecretValue } from './secret-reference'
import { Direction, EMPTY_SUPPLY_CHAIN, FindingLifecycle, SecurityCategorySnapshot, SecurityTimelineFile, SecurityTimelineFileSchema, SecurityTimelineSnapshot, SecurityTrendLine, SecurityTrendResult, SupplyChainSnapshot, TimeToFixResult, TimeToFixStats, TrendAttribution, securityFindingId } from './security-timeline-types'
import { detectStack } from './stack-detector'
import { DEFAULT_SECURITY_CONFIG, RuleOverride, ScanResult, SecurityConfig, SecurityFinding, SecurityRule, SecuritySeverity } from './types'
import { skipDirGlobs } from '@harness-engineering/graph'
import { minimatch } from 'minimatch'
import { execSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import * as fs, { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path, { dirname, isAbsolute, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
```
