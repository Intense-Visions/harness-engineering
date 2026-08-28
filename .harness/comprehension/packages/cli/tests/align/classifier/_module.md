---
schemaVersion: 1
module: 'packages/cli/tests/align/classifier'
sourceHash: '384312d71710be0d81f4be3d2b239566ad9cd441aae378016b0e9b3957687b0c'
compiledAt: '2026-08-28T01:22:09.494Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['pre-flight.test.ts', 'token-import.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { classifyFinding } from '../../../src/align/classifier/pre-flight'
import { findTokenImport } from '../../../src/align/classifier/token-import'
import { DriftFinding } from '../../../src/drift/findings/finding'
import { TokenPathIndex } from '../../../src/drift/resolvers/tokens'
import { describe, expect, it } from 'vitest'
```
