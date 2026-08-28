---
schemaVersion: 1
module: 'packages/cli/src/align'
sourceHash: 'ac9ef585692f37da5322fa2caf28a222bc65f2b6377554f0545343bd9482aeb8'
compiledAt: '2026-08-28T01:22:08.635Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['exports.ts', 'index.ts']
---

## Interface Contract

```ts
export AlignDesignSystemOutput
export FixOutcome
export runAlignDesignSystem
```

## Dependency Slice

```
import { DriftFinding, DriftStrictness } from '../drift/findings/finding.js'
import { runDetectDrift } from '../drift/index.js'
import { TokenPathIndex, loadTokenPathIndex } from '../drift/resolvers/tokens.js'
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { classifyFinding } from './classifier/pre-flight.js'
import { applyT001Codemod } from './codemods/t001-hex.js'
import { applyT002Codemod } from './codemods/t002-font-family.js'
import { applyT003Codemod } from './codemods/t003-px-spacing.js'
import { AlignDesignSystemOutput, AlignMode, FixOutcome } from './findings/outcome.js'
import { applyInverse } from './revert/inverse.js'
import { hashContent, loadLastBatch, saveLastBatch } from './revert/state.js'
import { emitPrimitiveSuggestion } from './suggestions/p-primitives.js'
import { emitT004Suggestion } from './suggestions/t004-deprecated.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
