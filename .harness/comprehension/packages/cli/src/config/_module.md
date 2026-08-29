---
schemaVersion: 1
module: "packages/cli/src/config"
sourceHash: "61d7c773f670d879172ce9c4d851bffeb59382aefd0a1e70c2394b3cf5769921"
compiledAt: "2026-08-29T15:27:03.357Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["analysis-schema.ts", "ingest-schema.ts", "loader.ts", "schema.amr.test.ts", "schema.ts", "stripped-keys.test.ts", "stripped-keys.ts"]
---

## Summary

`packages/cli/src/config` provides schema validation and loading for `harness.config.json`. It defines the project-wide configuration shape (via Zod schemas), loads and validates the file from disk, and exposes helper functions to extract specific config blocks without importing the full schema.

The module emphasizes **graceful degradation**: when config is missing or malformed, loaders return sensible defaults so harness commands keep working. Unknown or mis-nested keys are silently dropped by Zod but warned about non-fatally to stderr—this prevents silent no-ops from plausible-but-wrong configs.

Several config blocks (`analysis.exclude`, `design.exclude`, `deps.exclude`, `ingest.*`) are kept in isolated schemas so hot paths can load them without dragging in the full HarnessConfigSchema and its transitive imports. All glob patterns use minimatch syntax and compose cleanly (e.g., `analysis.exclude` + `design.exclude` stack).

## Invariants

- Best-effort, never-fail loading: findConfigFile() walks up the directory tree; loadConfig() returns sensible defaults on any I/O or parse error. Commands must work on projects that have not run `harness init`.
- Non-fatal dropped-key warnings: Unknown schema keys trigger stderr warnings but never fail the load (resolveConfig() returns Ok). This catches typos without breaking.
- Hot-path schemas isolated from transitive deps: AnalysisConfigSchema, IngestConfigSchema, DepsConfigSchema live in their own files (*-schema.ts) so ingest/scan/check-deps commands can load them without importing @harness-engineering/core or other full-schema dependencies.
- Glob pattern composition: analysis.exclude is project-wide and stacks *on top of* each scanner's own excludes (e.g., entropy.excludePatterns, design.exclude). Each path segment uses minimatch syntax.
- Gitignore respect by default: ingest.respectGitignore defaults true; .gitignore lines are parsed as additional exclude patterns for code ingestion.
- Backend schema interop: AgentConfigSchema must accept orchestrator's BackendDefSchema + RoutingConfigSchema (capabilities, routing.policy) for AMR config-file support (guarded by schema.amr.test.ts).

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
