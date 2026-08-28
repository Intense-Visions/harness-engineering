---
schemaVersion: 1
module: 'packages/linter-gen/tests/schema'
sourceHash: 'b13a7b090375a656302d4377afe422a3f9de84b346594711c32890f352cfc0d5'
compiledAt: '2026-08-28T01:22:11.948Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['linter-config.test.ts']
---

## Summary

This test suite validates two Zod schemas for linter-generator configuration. `RuleConfigSchema` enforces individual lint rules: kebab-case names, a type identifier, rule-specific config, and an optional severity field (defaults to 'error'). `LinterConfigSchema` validates the top-level config file: version must be exactly 1, output path, a non-empty rules array, and optional templates mapping (kebab-case type → .hbs file path). Tests verify both valid configs parse cleanly and invalid configs (wrong version, empty rules, PascalCase names) are rejected.

## Invariants

- Rule names must be kebab-case; PascalCase and other formats are rejected
- Config version is pinned to 1; any other value fails validation
- At least one rule is required; empty rules array is invalid
- Severity defaults to 'error' when omitted from rule config
- Templates field is optional but when present must map kebab-case type names to .hbs file paths
- Rule type must be defined either as a built-in type or registered in the templates mapping

## Interface Contract

```ts

```

## Dependency Slice

```
import { LinterConfigSchema, RuleConfigSchema } from '../../src/schema/linter-config'
import { describe, expect, it } from 'vitest'
```
