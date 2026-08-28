---
schemaVersion: 1
module: 'packages/graph/src/ingest/extractors'
sourceHash: 'f7ffec6c01c846c118c942e4b28fd489a26818519e3b4ea9ef5262a7c1f984fc'
compiledAt: '2026-08-28T01:22:11.624Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'ApiPathExtractor.ts',
    'EnumConstantExtractor.ts',
    'ExtractionRunner.ts',
    'TestDescriptionExtractor.ts',
    'ValidationRuleExtractor.ts',
    'index.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export ALL_EXTRACTORS
export ApiPathExtractor
export DEFAULT_EXTRACTION_EXCLUDE
export EnumConstantExtractor
export ExtractionRecord
export ExtractionRunResult
export ExtractionRunner
export Language
export SignalExtractor
export TestDescriptionExtractor
export ValidationRuleExtractor
export createExtractionRunner
export detectLanguage
```

## Dependency Slice

```
import { GraphStore } from '../../store/GraphStore.js'
import { EdgeType, GraphEdge, GraphNode, IngestResult, NodeType } from '../../types.js'
import { hash } from '../ingestUtils.js'
import { DEFAULT_SKIP_DIRS } from '../skip-dirs.js'
import { ApiPathExtractor } from './ApiPathExtractor.js'
import { EnumConstantExtractor } from './EnumConstantExtractor.js'
import { DEFAULT_EXTRACTION_EXCLUDE, ExtractionRunner } from './ExtractionRunner.js'
import { TestDescriptionExtractor } from './TestDescriptionExtractor.js'
import { ValidationRuleExtractor } from './ValidationRuleExtractor.js'
import { ExtractionRecord, Language, SignalExtractor } from './types.js'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
```
