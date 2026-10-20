---
schemaVersion: 1
module: 'packages/core/tests/entropy'
sourceHash: 'f464dab6ad050e2846819067749dd95c8d3e8df84fa86e72a6298e5e3671b2f0'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'analyzer.behavior.test.ts',
    'analyzer.duplication.test.ts',
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
import { detectDuplication } from '../../src/entropy/detectors/duplication'
import { PathAlias, loadPathAliases, resolveAliasCandidates } from '../../src/entropy/path-aliases'
import { buildSnapshot, parseDocumentationFile, resolveEntryPoints } from '../../src/entropy/snapshot'
import { CodebaseSnapshot, DuplicationReport, EntropyConfig } from '../../src/entropy/types'
import { createEntropyError } from '../../src/shared/errors'
import { TypeScriptParser } from '../../src/shared/parsers'
import { Ok } from '../../src/shared/result'
import { skipDirGlobs } from '@harness-engineering/graph'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import * as fs from 'node:fs'
import from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import { tmpdir } from 'os'
import { dirname, join, resolve, sep } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
