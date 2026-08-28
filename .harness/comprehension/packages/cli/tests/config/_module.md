---
schemaVersion: 1
module: 'packages/cli/tests/config'
sourceHash: '9e623f328eb131a928f1b15304ab62b12ffa6cd218e23b476694248ce08724d6'
compiledAt: '2026-08-28T01:22:09.672Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/cli/tests/config` module validates Harness CLI configuration schemas through schema-first validation paired with graceful fallback loaders. It tests five configuration dimensions: analysis exclude patterns, dependency exclude patterns, constraint pack selection, deployment gates, and design system configuration. Each test file uses Zod for schema validation (`safeParse`/`parse`) and verifies both standalone schema behavior and integration into the top-level `HarnessConfigSchema`. The central pattern is: schemas enforce contracts (types, constraints, defaults); loaders handle filesystem reality (missing files, malformed JSON, absent blocks) by returning sensible defaults rather than throwing. All configuration blocks are optional at the top level; absence and validation failure both degrade gracefully.

## Invariants

- Exclude patterns reject empty strings and require arrays — AnalysisConfigSchema.safeParse({ exclude: [''] }).success === false; loaders return [] on validation failure
- Loaders return [] for missing/malformed configs, not errors — loadAnalysisExclude() and loadDepsExclude() silently degrade when config file is absent, JSON malformed, block missing, or validation fails
- Tri-state fields (enabled) distinguish undefined from false — DesignConfigSchema and DeploymentGateConfigSchema support enabled?: boolean; undefined, true, and false are three distinct states
- Interdependent field validation enforced — if enabled: true, then platforms must be a non-empty array; conditional validation is schema-enforced, not loader-enforced
- All config blocks integrate as optional into HarnessConfigSchema — top-level config without analysis, deps, deployment, design, or constraintPacks blocks must parse successfully
- Constraint pack names are arbitrary strings — constraintPacks is an optional array of strings; no whitelist validation at config-parse time
- Design strictness and platform enums are exhaustive — strictness ∈ {standard, strict, permissive}; platforms ⊆ {web, mobile}; reject values outside these sets

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
