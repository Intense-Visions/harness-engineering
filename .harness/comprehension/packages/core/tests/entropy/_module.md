---
schemaVersion: 1
module: 'packages/core/tests/entropy'
sourceHash: '70ad1bae7dc68362bbdd937eb8cf44b4c75cbe8767b1d956a19c0889590c996d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'analyzer.behavior.test.ts',
    'analyzer.duplication.test.ts',
    'analyzer.test.ts',
    'entry-points-no-analysis.test.ts',
    'entry-points-unanalysed.test.ts',
    'graph-integration.test.ts',
    'path-aliases.test.ts',
    'snapshot-parser-unavailable.test.ts',
    'snapshot-win32-doc-glob.test.ts',
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
import { buildSnapshot, parseDocumentationFile, parseSourceFiles, resolveEntryPoints } from '../../src/entropy/snapshot'
import { CodebaseSnapshot, DuplicationReport, EntropyConfig } from '../../src/entropy/types'
import { createEntropyError } from '../../src/shared/errors'
import { TypeScriptParser } from '../../src/shared/parsers'
import { TypeScriptParser } from '../../src/shared/parsers/typescript'
import { Ok } from '../../src/shared/result'
import { memberSets } from '../duplication/fixtures'
import { skipDirGlobs } from '@harness-engineering/graph'
import * as fs from 'fs'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import * as path from 'node:path'
import { tmpdir } from 'os'
import * as os from 'os'
import { dirname, join, resolve, sep } from 'path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
