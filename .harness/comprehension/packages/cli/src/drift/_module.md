---
schemaVersion: 1
module: 'packages/cli/src/drift'
sourceHash: '83a2a677695eb308b7421687601e0113a1ee3c4b5e1c90eb0f2341141a0d517d'
compiledAt: '2026-08-28T01:22:09.217Z'
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
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js'
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { Verifier } from '../shared/verifier.js'
import { DriftFinding, DriftSeverity, DriftStrictness } from './findings/finding.js'
import { loadComponentRegistry } from './resolvers/component-registry.js'
import { loadTokenSet } from './resolvers/tokens.js'
import { runPrimitiveAdoptionRule } from './rules/primitive-adoption-rule.js'
import { runTokenBypassRule } from './rules/token-bypass-rule.js'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
