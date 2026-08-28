---
schemaVersion: 1
module: 'packages/cli/tests/config'
sourceHash: '9e623f328eb131a928f1b15304ab62b12ffa6cd218e23b476694248ce08724d6'
compiledAt: '2026-08-28T01:22:09.672Z'
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
    'loader.test.ts',
    'local-models-harness-fit-schema.test.ts',
    'review-schema.test.ts',
    'rollback-schema.test.ts',
    'schema.roadmap-mode.test.ts',
    'schema.test.ts',
    'schema.tracker-kind.test.ts',
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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
