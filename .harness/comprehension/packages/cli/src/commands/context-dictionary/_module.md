---
schemaVersion: 1
module: 'packages/cli/src/commands/context-dictionary'
sourceHash: '23e4bf7f2a234ed58393765a84fce3fedabf0c74622a2b88b19bfc8ef71ed6bc'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['context-dictionary.test.ts', 'corpus.ts', 'index.ts']
---

## Interface Contract

```ts
export createContextDictionaryCommand
export loadReport
export renderReport
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { readComprehensionCorpus } from './corpus'
import { loadReport, renderReport } from './index'
import { Codebook, CodebookReport, CorpusDocument, CorpusSpan, buildCodebookReport, emptyCodebook } from '@harness-engineering/core'
import chalk from 'chalk'
import { Command } from 'commander'
import { glob } from 'glob'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
```
