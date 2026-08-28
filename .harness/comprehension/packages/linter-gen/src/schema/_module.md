---
schemaVersion: 1
module: 'packages/linter-gen/src/schema'
sourceHash: '21411ea43bcd5e85df4e76d8f60c90f74e7709ac01e98a2dc89054bb53ded5b1'
compiledAt: '2026-08-28T01:22:11.942Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['linter-config.ts']
---

## Summary

This module defines two Zod schemas that govern linter configuration: **RuleConfigSchema** for individual ESLint rule definitions and **LinterConfigSchema** for the complete `harness-linter.yml` config file. Each rule specifies a kebab-case name, a type (which selects a template), an ESLint severity level, and template-specific config. The top-level config pins a version, specifies an output directory for generated rules, optionally maps rule types to custom template paths, and requires at least one rule.

## Invariants

- Version pinned to 1: config must declare `version: 1` exactly; no forwards/backwards compatibility for schema changes
- Minimum one rule: array validation enforces `min(1)` — empty config is rejected at parse time
- Rule names are kebab-case: regex validates `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`; tooling downstream (rule file generation, imports) depends on this canonical format
- Output path required and non-empty: enforced by `z.string().min(1)` — generated rules written here
- Rule type is non-empty and determines template selection: type field drives template lookup (via optional templates map or defaults); empty type breaks downstream code-gen
- Config is flexible record: rule config is `z.record(z.unknown())` to support heterogeneous template needs without schema fragmentation
- Severity defaults to 'error': unspecified severity doesn't fail validation; implicitly cascades to all generated rules

## Interface Contract

```ts
export LinterConfigSchema
export RuleConfigSchema
```

## Dependency Slice

```
import { z } from 'zod'
```
