---
schemaVersion: 1
module: 'packages/cli/src/brand'
sourceHash: '3dd1fc3efe88a481298ae794fbf9ccb71c2724cacc1a57eaf81847473c944013'
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
import { collectDesignScanFiles, designScanAbstention, noFilesScannedError, resolveDesignExcludePatterns } from '../shared/design-scan-targets.js'
import { Verifier } from '../shared/verifier.js'
import { BrandFinding, BrandSeverity, BrandStrictness } from './findings/finding.js'
import { BrandRules, loadBrandRules } from './resolvers/design-md-brand.js'
import { BrandTokenIndex, loadBrandTokenIndex } from './resolvers/token-extensions.js'
import { runForbiddenPhrasesRule } from './rules/forbidden-phrases-rule.js'
import { runTokenMisuseRule } from './rules/token-misuse-rule.js'
import * as fs from 'node:fs'
```
