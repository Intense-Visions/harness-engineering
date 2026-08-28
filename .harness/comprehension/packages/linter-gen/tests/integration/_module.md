---
schemaVersion: 1
module: 'packages/linter-gen/tests/integration'
sourceHash: 'a19f9c0baac60a2dea0d6fc68550984a8e4fdcf1086ba7c0d827dc7fcd28de4b'
compiledAt: '2026-08-28T01:22:11.944Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['generate.test.ts']
---

## Summary

The `packages/linter-gen/tests/integration` module validates end-to-end ESLint rule generation. Tests exercise the `generate()` orchestrator function, which reads a YAML config file and emits TypeScript rule files plus an index.ts barrel export. Three scenarios are covered: basic rule generation with config validation, custom Handlebars template resolution, and batch generation with correct index exports. All tests use ephemeral temp directories.

## Invariants

- Config contract: YAML must declare version, output directory, and rules[] array; each rule requires name, type, and config properties
- Output structure: One TS file per rule (kebab-case filename) + index.ts barrel when success=true
- Naming convention: Rule names are camelCased in code (e.g., no-react-in-services → noReactInServices export)
- Template resolution: Custom Handlebars templates in templates/ override defaults, keyed by rule type
- Config serialization: {{{json config}}} tag serializes rule config as JSON in generated templates
- Result shape: generate() returns { success: boolean, rulesGenerated: string[] }
- Index exports: Each rule exports as 'rule-name': camelCaseName entry with corresponding import statement

## Interface Contract

```ts

```

## Dependency Slice

```
import { generate } from '../../src/generator/orchestrator'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
