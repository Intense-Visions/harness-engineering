---
schemaVersion: 1
module: 'packages/eslint-plugin/scripts'
sourceHash: 'b49ed1a3bc805d118eb57d7e855de720c9c66d3429399b46e81ba2b16933130f'
compiledAt: '2026-08-28T01:22:11.511Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['generate-rules-barrel.mjs']
---

## Summary

The `scripts/` module contains a single code generator, `generate-rules-barrel.mjs`, that automates maintenance of the ESLint plugin's rule registry. It scans `src/rules/` for rule files and generates `src/rules/index.ts`, a fresh barrel exporting all rules. By deriving the registry from the filesystem, a new rule file (`my-rule.ts`) is automatically picked up without manual barrel editing. Output is deterministic (alphabetically sorted) and Prettier-shaped, making regeneration a no-op when nothing changes. Run via `pnpm generate:rules`, hooked into prebuild/pretest/pretypecheck. A `--check` mode for CI exits non-zero if the barrel is stale without writing.

## Invariants

- One-to-one filename-to-rule mapping: each rule file basename (minus .ts) is its rule name; the file's default export is the rule module
- No index.test.ts or stale index.ts in the barrel: scanner explicitly excludes index.ts and \*.test.ts to avoid self-loops and test clutter
- Deterministic output order: rules sorted alphabetically so regenerating on unchanged ruleset produces no diff, keeping CI and precommit clean
- Barrel is auto-generated, never hand-edited: the barrel is the single source of truth for rule registration; manual edits are overwritten on next generation
- --check mode must pass in CI: stale barrels block landing; developers must run pnpm generate:rules before pushing
- kebab-case rule names map to camelCase bindings: rule file my-rule.ts becomes binding myRule via deterministic but non-obvious mapping logic

## Interface Contract

```ts

```

## Dependency Slice

```
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
```
