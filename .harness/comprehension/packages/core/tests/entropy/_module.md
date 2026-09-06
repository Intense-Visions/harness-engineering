---
schemaVersion: 1
module: 'packages/core/tests/entropy'
sourceHash: '8983961fcd566ac94fc595351425adedd5c233dd4fc142c5fdc3a9ee213a7aad'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'analyzer.behavior.test.ts',
    'analyzer.test.ts',
    'graph-integration.test.ts',
    'path-aliases.test.ts',
    'snapshot.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { EntropyAnalyzer } from '../../src/entropy/analyzer'
import { detectDeadCode } from '../../src/entropy/detectors/dead-code'
import { detectDocDrift } from '../../src/entropy/detectors/drift'
import { PathAlias, loadPathAliases, resolveAliasCandidates } from '../../src/entropy/path-aliases'
import { buildSnapshot, parseDocumentationFile, resolveEntryPoints } from '../../src/entropy/snapshot'
import { CodebaseSnapshot, EntropyConfig } from '../../src/entropy/types'
import { TypeScriptParser } from '../../src/shared/parsers'
import { skipDirGlobs } from '@harness-engineering/graph'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import * as fs from 'node:fs'
import from 'node:fs/promises'
import * as os from 'node:os'
import { tmpdir } from 'os'
import { dirname, join, resolve, sep } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
