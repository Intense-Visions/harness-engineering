---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/parsers'
sourceHash: '23351c943896b39cf9909183162e98632696290cb501ef03253765831a0ba23a'
compiledAt: '2026-08-28T01:22:08.730Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
