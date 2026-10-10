---
schemaVersion: 1
module: 'packages/cli/src/drift'
sourceHash: '21b4708a31570d10020c350370040195bf70139b5bffb79550e051b0e56a964e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['exports.ts', 'index.ts']
---

## Interface Contract

```ts
export DriftFinding
export DriftFindingCode
export DriftSeverity
export DriftStrictness
export runDetectDrift
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { collectDesignScanFiles, resolveDesignExcludePatterns } from '../shared/design-scan-targets.js'
import { Verifier } from '../shared/verifier.js'
import { DriftFinding, DriftSeverity, DriftStrictness } from './findings/finding.js'
import { loadComponentRegistry } from './resolvers/component-registry.js'
import { loadTokenSet } from './resolvers/tokens.js'
import { runPrimitiveAdoptionRule } from './rules/primitive-adoption-rule.js'
import { runTokenBypassRule } from './rules/token-bypass-rule.js'
import * as fs from 'node:fs'
```
