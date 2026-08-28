---
schemaVersion: 1
module: 'packages/linter-gen/tests/generator'
sourceHash: '2042d4ac72a652108242f8a72367e3a3818f85e5b0858897abbdefd4195b740d'
compiledAt: '2026-08-28T01:22:11.947Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index-generator.test.ts', 'orchestrator.test.ts', 'rule-generator.test.ts']
---

## Summary

The `packages/linter-gen/tests/generator` test suite validates the code-generation pipeline that transforms YAML linter configurations into executable TypeScript rule files. It exercises three core generators: Index Generator (creates barrel export with camelCase naming conversion), Orchestrator (validates YAML config, generates rule files, creates index, supports dryRun and outputDir overrides), and Rule Generator (renders individual rules from Handlebars templates with error handling). Tests cover happy paths (valid configs, single/multiple rules) and error paths (invalid version, template syntax errors, dry-run non-I/O) using temporary directories cleaned up per-test.

## Invariants

- Config version is locked to 1 — validation rejects any other version
- YAML config structure requires version, output, and rules[] with name, type, severity, config per rule
- Rule names convert to camelCase for imports (no-ui-in-services → noUiInServices)
- All generated output includes a 'do not edit' header marking generated code
- Index file exports both named exports and a keyed rules object for dual-access patterns
- Template rendering uses Handlebars syntax; malformed templates fail early with error result
- dryRun prevents all file I/O but validates config and returns rulesGenerated list
- outputDir parameter overrides config.output without mutating the config file
- Generated structure is flat — all rules in one directory with a single index.ts

## Interface Contract

```ts

```

## Dependency Slice

```
import { TemplateSource } from '../../src/engine/template-loader'
import { generateIndex } from '../../src/generator/index-generator'
import { GenerateOptions, generate, validate } from '../../src/generator/orchestrator'
import { GeneratedRule, generateRule } from '../../src/generator/rule-generator'
import { RuleConfig } from '../../src/schema/linter-config'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path, { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
