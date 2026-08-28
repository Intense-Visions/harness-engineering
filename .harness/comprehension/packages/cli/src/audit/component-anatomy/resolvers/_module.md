---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/resolvers'
sourceHash: '55ed35d92980027a53de6194aacf4d83105c6958572e613f2da9b9eef26f1038'
compiledAt: '2026-08-28T01:22:08.722Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['component-type.ts', 'source-of-truth.ts']
---

## Summary

This module implements a three-layer stack-based resolver pattern to answer two core questions during component audits. `resolveComponentType` determines what kind of component a file is by querying JSDoc `@component-type` tag, then DESIGN.md `## Component Registry` table, then catalog match on top-level export name. `resolveAnatomyRules` determines anatomy conventions by querying JSDoc `@anatomy-*` tags, then DESIGN.md `## Component Anatomy Overrides`, then built-in catalog lookup. Both resolvers enforce strict layer precedence (JSDoc beats DESIGN.md beats catalog), return null for silent skip when no match, and cache DESIGN.md parses at the process level since they're static.

## Invariants

- Process-scoped immutability: componentTypeSet and registryCache/overridesCache are computed once at module load and never mutated; DESIGN.md is static per process so memoization is correct
- Strict layer precedence: if a layer matches, lower layers are skipped with no merging or fallback chaining
- File paths resolved relative to DESIGN.md: path.resolve(designDir, entry.file) ensures consistent key lookup in caches regardless of caller's working directory
- Export name matching only recognizes top-level declarations (export const Button, export function Button, export default Button); re-exports and barrels fall through to null to avoid false positives
- Returns null = silent skip: the audit deliberately does not guess when no layer matches; downstream consumers handle null gracefully
- Cache keys are absolute paths: both registry and overrides caches key on absolute file paths to handle symlinks and relative-path variations consistently

## Interface Contract

```ts
export resolveAnatomyRules
export resolveComponentType
```

## Dependency Slice

```
import { getCatalogTypes, lookupConvention } from '../catalog/index.js'
import { buildAnatomyRuleFromJsDoc } from '../parsers/anatomy-tags.js'
import { parseAnatomyOverrides } from '../parsers/design-overrides.js'
import { findDesignMd, parseComponentRegistry } from '../parsers/design-registry.js'
import { extractLeadingJsDoc, readJsDocTagValue } from '../parsers/jsdoc.js'
import { ConventionRule } from '../rules/convention-rule.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
