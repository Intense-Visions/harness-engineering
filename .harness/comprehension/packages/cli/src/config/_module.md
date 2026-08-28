---
schemaVersion: 1
module: 'packages/cli/src/config'
sourceHash: '954cfc56f4da26408893b1d3a3f8306ba0228817810741885a74753b21a28b7f'
compiledAt: '2026-08-28T11:59:59.007Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'analysis-schema.ts',
    'ingest-schema.ts',
    'loader.ts',
    'schema.amr.test.ts',
    'schema.ts',
    'stripped-keys.test.ts',
    'stripped-keys.ts',
  ]
---

## Summary

The `packages/cli/src/config` module provides the unified configuration system for the Harness CLI. It defines, loads, validates, and normalizes `harness.config.json` across ~50 subsystems (design, security, performance, agents, roadmap, comprehension, etc.).

**Core components:**

- **schema.ts**: Exhaustive Zod schemas with baked-in defaults that serve as the single source of truth.
- **loader.ts**: File discovery (tree walk), JSON parsing, validation with detailed errors, and non-fatal warnings for mis-nested keys.
- **analysis-schema.ts / ingest-schema.ts / ingest-schema.ts**: Lightweight subset loaders so hot-path commands can load just their specific excludes without pulling transitive dependencies (core, orchestrator).
- **stripped-keys.ts**: Walks schema + raw JSON to detect silently-dropped keys (typos, mis-nestings), respects `.passthrough()` sections, suggests near-typos via edit distance.

The module gracefully degrades when config is missing or invalid, allowing commands to work on unconfigured projects with sane built-ins.

## Invariants

- Schema is canonical for defaults — every .default() is THE source of truth; consumers call SomeSchema.parse({}) rather than re-declaring fallbacks to prevent drift.
- Graceful degradation — missing/malformed config does NOT crash analysis commands; loadAnalysisExclude/loadDesignExclude/loadDepsExclude all return [] on any error.
- Transitive import isolation — analysis/ingest/design loaders in separate files so consumers don't drag in @harness-engineering/core or orchestrator schemas (critical for test mocking).
- Co-tenant namespace protection — reserved keys (canary, x-\*) at root level are NEVER reported as stripped; they belong to sibling tools. Deeper nesting is still harness.
- Passthrough sections are respected — security/performance/operationalPolicy use .passthrough() to allow extension keys; unknown keys silently kept, never warned.
- Stripped-key detection is best-effort — walk failures catch/swallow so config loading never breaks due to diagnostics; warnings go to stderr, stdout stays clean.
- Zod union branches walked in definition order — first match determines reported path; AMR config (schema.amr.test.ts) validates AgentConfigSchema accepts backend capabilities + routing from orchestrator (load-bearing CLI coupling).

## Interface Contract

```ts
export AgentConfigSchema
export AnalysisConfig
export AnalysisConfigSchema
export BoundaryConfigSchema
export BranchingConfigSchema
export BrandComplianceConfigSchema
export ComplianceConfigSchema
export ComponentAnatomyAuditConfigSchema
export ComprehensionConfigSchema
export CraftConfigSchema
export DeploymentGateConfigSchema
export DepsConfig
export DepsConfigSchema
export DesignAuditConfigSchema
export DesignConfigSchema
export DesignCraftConfigSchema
export DriftConfigSchema
export DriftDetectionConfigSchema
export EntropyConfigSchema
export ForbiddenImportSchema
export HarnessConfigSchema
export I18nConfigSchema
export I18nCoverageConfigSchema
export I18nMcpConfigSchema
export IngestConfig
export IngestConfigSchema
export IntegrationsConfigSchema
export KnowledgeConfigSchema
export LayerSchema
export LocalModelsConfigSchema
export LocalModelsHardwareOverrideSchema
export LocalModelsHarnessFitConfigSchema
export LocalModelsInstallerConfigSchema
export LocalModelsPoolConfigSchema
export LocalModelsRefreshConfigSchema
export ModelTierConfigSchema
export OperationalPolicyConfigSchema
export PerformanceConfigSchema
export PhaseGateMappingSchema
export PhaseGatesConfigSchema
export ReviewConfigSchema
export RoadmapAutoTriageConfigSchema
export RoadmapConfigSchema
export RollbackConfigSchema
export RollbackSignalRuleSchema
export SecurityConfigSchema
export SkillHookEntrySchema
export SkillHooksConfigSchema
export TelemetryConfigSchema
export TelemetryExportOTLPSchema
export TrackerConfigSchema
export VocabularyConfigSchema
export VocabularyRuleSchema
export collectStrippedKeys
export findConfigFile
export formatStrippedKeyWarnings
export loadAnalysisExclude
export loadConfig
export loadDepsExclude
export loadDesignExclude
export resolveConfig
```

## Dependency Slice

```
import { CLIError, ExitCode } from '../utils/errors'
import { AnalysisConfigSchema, DepsConfigSchema } from './analysis-schema.js'
import { IngestConfigSchema } from './ingest-schema.js'
import { loadConfig } from './loader'
import { AgentConfigSchema, HarnessConfig, HarnessConfigSchema } from './schema'
import { collectStrippedKeys, formatStrippedKeyWarnings } from './stripped-keys'
import { ArchConfigSchema, Err, GoldenConfigSchema, Ok, Result } from '@harness-engineering/core'
import { skipDirGlobs } from '@harness-engineering/graph'
import { BackendDefSchema, RoutingConfigSchema } from '@harness-engineering/orchestrator'
import * as fs from 'fs'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
