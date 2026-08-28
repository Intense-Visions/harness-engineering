---
schemaVersion: 1
module: 'packages/core/tests/entropy/integration'
sourceHash: 'afeb04c1c6555f8173f19acd060cb583512ae548f9b2d2c83304f0f7e191385b'
compiledAt: '2026-08-28T01:22:10.837Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['full-analysis.test.ts', 'multi-language-snapshot.test.ts', 'python-symbol-resolution.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { EntropyAnalyzer } from '../../../src/entropy'
import { buildSnapshot } from '../../../src/entropy/snapshot'
import { TypeScriptParser } from '../../../src/shared/parsers'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
```
