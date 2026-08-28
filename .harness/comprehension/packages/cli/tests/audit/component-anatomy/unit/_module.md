---
schemaVersion: 1
module: 'packages/cli/tests/audit/component-anatomy/unit'
sourceHash: 'd10a0c03d9310b31b56cdd77cb4507b75ca0a3a0cf61a4e0eed536155f775d00'
compiledAt: '2026-08-28T01:22:09.563Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'anatomy-overrides.test.ts',
    'catalog-registry.test.ts',
    'component-type-resolver.test.ts',
    'design-registry.test.ts',
    'jsdoc-parser.test.ts',
    'patterns.test.ts',
    'severity.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { getCatalogTypes, listConventions, lookupConvention } from '../../../../src/audit/component-anatomy/catalog/index.js'
import { PATTERN_CHECKS } from '../../../../src/audit/component-anatomy/catalog/patterns/index'
import { getCatalogTypesPublic } from '../../../../src/audit/component-anatomy/exports.js'
import { Severity } from '../../../../src/audit/component-anatomy/findings/finding.js'
import { DesignStrictness, defaultSeverityForCode, resolveSeverity } from '../../../../src/audit/component-anatomy/findings/severity.js'
import { buildAnatomyRuleFromJsDoc } from '../../../../src/audit/component-anatomy/parsers/anatomy-tags'
import { parseAnatomyOverrides } from '../../../../src/audit/component-anatomy/parsers/design-overrides'
import { findDesignMd, parseComponentRegistry } from '../../../../src/audit/component-anatomy/parsers/design-registry'
import { extractLeadingJsDoc, readJsDocTag, readJsDocTagValue } from '../../../../src/audit/component-anatomy/parsers/jsdoc'
import { resolveComponentType } from '../../../../src/audit/component-anatomy/resolvers/component-type'
import { resolveAnatomyRules } from '../../../../src/audit/component-anatomy/resolvers/source-of-truth'
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
```
