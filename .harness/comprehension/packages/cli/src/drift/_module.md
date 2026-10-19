---
schemaVersion: 1
module: 'packages/cli/src/drift'
sourceHash: '85f6082564ab1c9436e469b6b50a5da60d4a372701bd0e1c9b6f7d66de49bf60'
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
import { collectDesignScanFiles, noFilesScannedError, resolveDesignExcludePatterns } from '../shared/design-scan-targets.js'
import { Verifier } from '../shared/verifier.js'
import { DriftFinding, DriftSeverity, DriftStrictness } from './findings/finding.js'
import { loadComponentRegistry } from './resolvers/component-registry.js'
import { loadTokenSet } from './resolvers/tokens.js'
import { runPrimitiveAdoptionRule } from './rules/primitive-adoption-rule.js'
import { runTokenBypassRule } from './rules/token-bypass-rule.js'
import * as fs from 'node:fs'
```
