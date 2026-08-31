---
schemaVersion: 1
module: 'packages/cli/src/config'
sourceHash: 'dc863539f98db1404b07f9d33ab8c065b28e872ba6ed534ac0727e43f7bbc41f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
