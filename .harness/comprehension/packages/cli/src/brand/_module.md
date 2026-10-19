---
schemaVersion: 1
module: 'packages/cli/src/brand'
sourceHash: 'f0a28ea99be2d73335216a0f7c656f9d40bb32d7d8cf1da65dc67b75483f5926'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export BrandFinding
export BrandFindingCode
export BrandSeverity
export BrandStrictness
export runAuditBrand
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { collectDesignScanFiles, noFilesScannedError, resolveDesignExcludePatterns } from '../shared/design-scan-targets.js'
import { Verifier } from '../shared/verifier.js'
import { BrandFinding, BrandSeverity, BrandStrictness } from './findings/finding.js'
import { BrandRules, loadBrandRules } from './resolvers/design-md-brand.js'
import { BrandTokenIndex, loadBrandTokenIndex } from './resolvers/token-extensions.js'
import { runForbiddenPhrasesRule } from './rules/forbidden-phrases-rule.js'
import { runTokenMisuseRule } from './rules/token-misuse-rule.js'
import * as fs from 'node:fs'
```
