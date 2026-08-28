---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/resolvers'
sourceHash: '55ed35d92980027a53de6194aacf4d83105c6958572e613f2da9b9eef26f1038'
compiledAt: '2026-08-28T01:22:08.722Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['component-type.ts', 'source-of-truth.ts']
---

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
