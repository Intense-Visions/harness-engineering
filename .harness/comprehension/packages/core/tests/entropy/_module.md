---
schemaVersion: 1
module: 'packages/core/tests/entropy'
sourceHash: '3d1e4696cca9076e8debe4722b6a5586f6d32d9c391f7267b047a93e24eacad8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'analyzer.behavior.test.ts',
    'analyzer.test.ts',
    'entry-points-no-analysis.test.ts',
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
import * as fs from 'fs'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import * as fs from 'node:fs'
import from 'node:fs/promises'
import * as os from 'node:os'
import * as os, { tmpdir } from 'os'
import * as path, { dirname, join, resolve, sep } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
