---
schemaVersion: 1
module: 'packages/graph/tests/ingest/extractors'
sourceHash: '6271a4e27078ea473d410eca0e6cda5ffafc621777ddc3a9c2771f0a0f664c95'
compiledAt: '2026-08-28T01:22:11.748Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'ApiPathExtractor.test.ts',
    'EnumConstantExtractor.test.ts',
    'ExtractionRunner.test.ts',
    'TestDescriptionExtractor.test.ts',
    'ValidationRuleExtractor.test.ts',
    'integration.test.ts',
    'types.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CodeIngestor } from '../../../src/ingest/CodeIngestor.js'
import { ApiPathExtractor } from '../../../src/ingest/extractors/ApiPathExtractor.js'
import { EnumConstantExtractor } from '../../../src/ingest/extractors/EnumConstantExtractor.js'
import { DEFAULT_EXTRACTION_EXCLUDE, ExtractionRunner, detectLanguage } from '../../../src/ingest/extractors/ExtractionRunner.js'
import { TestDescriptionExtractor } from '../../../src/ingest/extractors/TestDescriptionExtractor.js'
import { ValidationRuleExtractor } from '../../../src/ingest/extractors/ValidationRuleExtractor.js'
import { createExtractionRunner } from '../../../src/ingest/extractors/index.js'
import { ExtractionRecord, Language, SignalExtractor } from '../../../src/ingest/extractors/types.js'
import { hash } from '../../../src/ingest/ingestUtils.js'
import { GraphStore } from '../../../src/store/GraphStore.js'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'os'
import * as path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
```
