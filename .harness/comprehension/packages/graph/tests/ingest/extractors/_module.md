---
schemaVersion: 1
module: 'packages/graph/tests/ingest/extractors'
sourceHash: '6271a4e27078ea473d410eca0e6cda5ffafc621777ddc3a9c2771f0a0f664c95'
compiledAt: '2026-08-28T01:22:11.748Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/graph/tests/ingest/extractors` module tests a multi-language code analysis pipeline that extracts semantic signals (HTTP routes, enums, test descriptions, validation rules) and emits them as normalized `ExtractionRecord` objects for storage in the knowledge graph. The test suite validates three core components: ApiPathExtractor (parses HTTP route definitions across Express/FastAPI/Gin/Actix/Spring), EnumConstantExtractor (recognizes enum-like constructs across all five languages), and ExtractionRunner (orchestrates extractors across a file tree with language detection and exclusion patterns). Records carry a stable hash-based ID, nodeType (business_process/business_term/business_rule), confidence score, and language-specific metadata.

## Invariants

- Stable ID generation: ExtractionRecord.id must be deterministic across runs for the same input; two extractions of identical content must yield identical IDs
- Class-level basePath hierarchy: In Java Spring annotations, method-level @RequestMapping under a class-level basePath must resolve under that basePath (e.g., /api/foo not /foo), and class-level declarations must not themselves be emitted as endpoints
- Nested as-const member isolation: In TypeScript const objects with multi-line nested values, sibling keys must not leak into the parent's member list, and nested closing braces must not terminate collection early
- Prose vs. pattern distinction: Comments and JSDoc lines containing 'enum <word>' must not be parsed as actual enum/const declarations; only anchored (line-start) patterns count (Issue #1331)
- Framework-aware confidence: Routes from high-confidence frameworks (Express, Spring, Actix) score 0.8–0.9; lower-confidence patterns (net/http) score 0.6

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
