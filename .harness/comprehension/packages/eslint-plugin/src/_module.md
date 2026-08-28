---
schemaVersion: 1
module: 'packages/eslint-plugin/src'
sourceHash: 'f4b97c3e0b09bb8a01952665933fe21b109abaa961d374329f7d0ef07a9b04ff'
compiledAt: '2026-08-28T01:22:11.520Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

This ESLint plugin (`@harness-engineering/eslint-plugin`) is the entry point for a set of 17 linting rules that enforce architectural, performance, security, and test hygiene standards across the Harness Engineering codebase. The module exports a plugin object with two preset configurations—`recommended` (permissive baseline) and `strict` (all violations fatal)—that activate subsets of rules at appropriate severity levels. The plugin covers concerns like layer-boundary violations, circular dependencies, forbidden imports, path normalization, async-safety patterns, test state management (no focused/skipped/disabled tests), and cross-platform spawn safety. The core design uses a self-referential plugin getter pattern to allow the plugin to reference itself in its own configuration without circular dependencies, while explicit type annotations ensure that TS2742 errors don't leak into downstream consumers' DTS builds.

## Invariants

- Self-reference pattern: Both config presets must use the getter-based self-reference to avoid circular dependencies and allow the plugin to be embedded in its own config.
- Type annotation explicitness: The `plugin` constant must be annotated as `TSESLint.FlatConfig.Plugin` with the import from `@typescript-eslint/utils`—this prevents TS2742 type-path leakage in downstream DTS generation.
- Rules re-export contract: Rules must be imported from a separate `./rules` module and re-exported as a named export; the plugin object references the same `rules` binding.
- Config rule naming: All rules in both configs must use the `@harness-engineering/<rule-name>` prefix; the strict config upgrades specific rules ('warn' → 'error') but does not invent new rules.
- Version sync: The `meta.version` in the plugin object should track the package's published version (manual sync required, no auto-generation).
- Config preset symmetry: Both `recommended` and `strict` must define the same rule set; severity levels diverge, but rule names do not.

## Interface Contract

```ts
export configs
export default
export rules
```

## Dependency Slice

```
import { rules } from './rules'
import { TSESLint } from '@typescript-eslint/utils'
```
