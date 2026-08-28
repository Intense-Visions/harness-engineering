---
schemaVersion: 1
module: 'packages/eslint-plugin/tests/integration'
sourceHash: '2f9de299fe9c0f75374db8e803a26dd76f2b455b1c5f9fd236c148bca304489e'
compiledAt: '2026-08-28T01:22:11.524Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['monorepo-path-anchor.test.ts', 'plugin.test.ts']
---

## Summary

The `packages/eslint-plugin/tests/integration` module validates two critical contracts: (1) monorepo path normalization for layer-based rules, ensuring paths are anchored to `harness.config.json` rather than a `/src/` heuristic, and (2) rule/config registry sync, verifying the plugin exports exactly the rule files on disk via an auto-generated barrel with no manual roster. Tests guard against silent path-matching failures in monorepos and phantom/missing rule registrations.

## Invariants

- Path anchor invariant: layer-based rules normalize paths relative to harness.config.json directory, not /src/ heuristic; monorepo package identity depends on this.
- Barrel-driven registration: plugin.rules must equal the sorted list of \*.ts files in src/rules/; auto-discovered, no manual roster, no stale registrations.
- Plugin registry sync: Object.keys(plugin.rules) must exactly match rule filenames on disk; guards both missing and phantom rules without test edits.
- Config exports required: both 'recommended' and 'strict' configs must be defined with non-empty rules object.
- Config plugin reference: configs['recommended|strict'].plugins['@harness-engineering'] must reference the plugin itself for proper rule namespacing.

## Interface Contract

```ts

```

## Dependency Slice

```
import plugin from '../../src/index'
import forbiddenImports from '../../src/rules/no-forbidden-imports'
import { clearConfigCache } from '../../src/utils/config-loader'
import { RuleTester } from '@typescript-eslint/rule-tester'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
```
