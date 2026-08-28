---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/parsers'
sourceHash: '23351c943896b39cf9909183162e98632696290cb501ef03253765831a0ba23a'
compiledAt: '2026-08-28T01:22:08.730Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'anatomy-tags.ts',
    'ast.test.ts',
    'ast.ts',
    'design-overrides.ts',
    'design-registry.ts',
    'jsdoc.ts',
  ]
---

## Summary

This module extracts React component anatomy metadata from source code for the audit pipeline. It bridges two sources of truth: JSDoc-declared component contracts (via `@anatomy-*` tags) and AST-extracted prop types (via TypeScript Compiler API).

**Core paths:** `buildAnatomyRuleFromJsDoc` parses `@anatomy-{slot,state,variant,size}` tags into structured `ConventionRule` objects with proper flag handling. `parseComponentDefinition(FromSource)` extracts the top-level exported component's name and prop-type member names using the TS AST, supporting inline types, interface/type references, arrow functions, and function declarations. Both degrade gracefully on missing data: JSDoc with no anatomy tags returns `null`; components with unresolvable types return the export name with empty members.

## Invariants

- Only PascalCase-named exports are treated as React components; lowercase exports are ignored (naming convention enforced)
- When multiple exported components exist, only the first is parsed; later definitions are not considered
- Returns three distinct states: null (no component), {exportName, propTypeMembers: []} (component found, props unresolvable), or full shape (success)—callers route to fallbacks based on this distinction
- JSDoc tag grammar is strict: @anatomy-slot name [required|exclusive] for single parts; @anatomy-variant a|b|c for enums—malformed tags silently drop
- No cross-file type resolution: type references outside the file return empty propTypeMembers (intentional MVP scope, complex resolution deferred)
- String-literal property names preserved as-is (e.g., 'data-col' with hyphens, not normalized)
- JSDoc-authored rules are sourced as 'design-component-anatomy/jsdoc' for audit traceability
- File I/O tests are hermetic: fs is mocked; source-string tests operate purely in-memory

## Interface Contract

```ts
export buildAnatomyRuleFromJsDoc
export extractLeadingJsDoc
export findDesignMd
export parseAnatomyOverrides
export parseComponentDefinition
export parseComponentDefinitionFromSource
export parseComponentRegistry
export readJsDocTag
export readJsDocTagValue
```

## Dependency Slice

```
import { AnatomyPart, ConventionRule } from '../rules/convention-rule.js'
import { parseComponentDefinition, parseComponentDefinitionFromSource } from './ast'
import { readJsDocTag } from './jsdoc.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
