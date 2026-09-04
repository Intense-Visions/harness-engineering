---
schemaVersion: 1
module: 'packages/cli/tests/config'
sourceHash: '428d8caee8f80e8fb784c6420c68044629a2efed80f113b1cd8efd0280ee7c8f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'analysis-schema.test.ts',
    'constraint-packs-schema.test.ts',
    'deployment-schema.test.ts',
    'design-schema.test.ts',
    'i18n-schema.test.ts',
    'integrations-schema.test.ts',
    'knowledge-schema.test.ts',
    'loader.root-boundary.test.ts',
    'loader.test.ts',
    'local-models-harness-fit-schema.test.ts',
    'review-schema.test.ts',
    'rollback-schema.test.ts',
    'schema.roadmap-mode.test.ts',
    'schema.test.ts',
    'schema.tracker-kind.test.ts',
    'schema.tracker-pnyon.test.ts',
    'skill-hooks-schema.test.ts',
    'telemetry-export-schema.test.ts',
    'toolchain-schema.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalysisConfigSchema, DepsConfigSchema, loadAnalysisExclude, loadDepsExclude } from '../../src/config/analysis-schema'
import { findConfigFile, loadConfig } from '../../src/config/loader'
import { DeploymentGateConfigSchema, DepsConfigSchema, DesignConfigSchema, HarnessConfigSchema, I18nConfigSchema, I18nCoverageConfigSchema, I18nMcpConfigSchema, IntegrationsConfigSchema, KnowledgeConfigSchema, LocalModelsConfigSchema, LocalModelsHarnessFitConfigSchema, ModelTierConfigSchema, ReviewConfigSchema, RollbackConfigSchema, SkillHookEntrySchema, SkillHooksConfigSchema, TelemetryConfigSchema, TelemetryExportOTLPSchema, TrackerConfigSchema, loadDepsExclude } from '../../src/config/schema'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
