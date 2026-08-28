---
schemaVersion: 1
module: 'packages/cli/src/config'
sourceHash: '707c367f2d8ec06e0e7f9381358aba0b3af2b0166811914b8c6dba476fe60874'
compiledAt: '2026-08-28T01:22:08.965Z'
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

`packages/cli/src/config` is the project configuration abstraction layer. It loads and validates `harness.config.json` from the filesystem (walking up the directory tree to find it), parses it against Zod schemas, and exposes configuration for CLI commands across multiple domains: analysis rules, ingestion controls, deployment gates, security policies, design tokens, performance budgets, and adaptive model routing.

The module is architected for **graceful degradation**: config loaders return sensible defaults (`[]`, `undefined`) on any error so commands keep working on un-configured projects. To avoid dragging expensive transitive imports into hot paths (e.g., `harness graph scan`), high-traffic schemas live in separate files (`analysis-schema.ts`, `ingest-schema.ts`) and have standalone loaders. Configuration discovery emits a non-fatal warning to stderr when the schema silently drops unknown keys, surfacing silent no-ops caused by typos or mis-nesting.

## Invariants

- Graceful-fail-all-loaders: loadAnalysisExclude, loadDesignExclude, loadDepsExclude must return [] on any failure (missing file, malformed JSON, schema validation error) so commands on un-initialized projects don't crash.
- Schema-fragment parity: When a schema field is extracted into a separate file (e.g., DesignExcludeSchema as a fragment of DesignConfigSchema), the field shape must remain in sync. Drift breaks invariant expectations.
- Stripped-key warnings are non-fatal: The warnStrippedKeys() call must never throw and never affect load success, even if key-collection logic fails. Logged to stderr only (never stdout) so JSON responses stay parseable.
- Directory tree search terminates at root: findConfigFile walks from startDir upward, stopping at path.parse(currentDir).root — must not infinite-loop or escape the filesystem.
- AMR surfaces must accept backend config without rejection: AgentConfigSchema must accept backends[*].capabilities and routing.policy keys so config-file adaptive-model-routing works end-to-end (schema.amr.test.ts guards this).

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
