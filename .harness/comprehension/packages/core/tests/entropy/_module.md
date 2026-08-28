---
schemaVersion: 1
module: 'packages/core/tests/entropy'
sourceHash: '1ddc7a718c7385227602a723e2c84a08528e84a32a7d9237d9c9c4aa523c4603'
compiledAt: '2026-08-28T01:22:10.811Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['analyzer.behavior.test.ts', 'analyzer.test.ts', 'graph-integration.test.ts', 'snapshot.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { EntropyAnalyzer } from '../../src/entropy/analyzer'
import { detectDeadCode } from '../../src/entropy/detectors/dead-code'
import { detectDocDrift } from '../../src/entropy/detectors/drift'
import { buildSnapshot, parseDocumentationFile, resolveEntryPoints } from '../../src/entropy/snapshot'
import { CodebaseSnapshot, EntropyConfig } from '../../src/entropy/types'
import { TypeScriptParser } from '../../src/shared/parsers'
import { skipDirGlobs } from '@harness-engineering/graph'
import * as fs from 'node:fs'
import from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
