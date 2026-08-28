---
schemaVersion: 1
module: 'packages/graph/src/ingest/extractors'
sourceHash: 'f7ffec6c01c846c118c942e4b28fd489a26818519e3b4ea9ef5262a7c1f984fc'
compiledAt: '2026-08-28T01:22:11.624Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/graph/src/ingest/extractors` module is a multi-language code signal extraction system that parses source files to identify semantic patterns (API routes, enums, constants, tests, validation rules) for the knowledge graph. Each extractor uses language-aware regex patterns to find framework-specific syntax (Express routes, FastAPI decorators, Spring annotations, etc.) and emit ExtractionRecords with unique hash-based IDs, confidence scores, and metadata. The ExtractionRunner orchestrates these extractors across six languages (TypeScript, JavaScript, Python, Go, Rust, Java) and persists results to GraphStore as semantic nodes in the dependency graph.

## Invariants

- ID uniqueness via hash: Each extraction record's ID combines filePath + pattern (hashed) to enable safe deduplication across runs
- Language dispatch consistency: extract() switch statement must include all entries in supportedExtensions array; missing cases silently return []
- Supported extensions must reflect dispatch logic: Each language case in switch must have corresponding extension in supportedExtensions; mismatch drops records for that language
- Confidence scoring is ordinal: High scores (0.9) indicate framework-specific patterns; low scores (0.6) indicate fallback heuristics; downstreams filter by confidence threshold
- Line numbers are 1-indexed: Off-by-one errors break source mapping and make results unusable for code navigation
- NodeType values integrate with GraphStore schema: Must emit only valid nodeType values (e.g., business_process, literal, constant) or cause ingestion failures
- Framework metadata must be deterministic: metadata.framework field (e.g., 'express', 'spring') must match actual detected pattern, not assumed; used for filtering and downstream linking
- Pattern regexes are immutable module-scope: Prevents recompilation per-line and avoids complexity drift in loop bodies (required for complexity detector compliance)

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
