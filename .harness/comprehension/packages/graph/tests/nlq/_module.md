---
schemaVersion: 1
module: 'packages/graph/tests/nlq'
sourceHash: '77ed76b888ff2f723cad421dedd762625539b76d7aa6d953ecb667536a8bd88f'
compiledAt: '2026-08-28T01:22:11.775Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'EntityExtractor.test.ts',
    'EntityResolver.test.ts',
    'IntentClassifier.test.ts',
    'ResponseFormatter.test.ts',
    'askGraph.test.ts',
    'staleness.test.ts',
    'types.test.ts',
  ]
---

## Summary

The `packages/graph/tests/nlq` module tests the natural language query pipeline for the graph store. It validates two core components: **EntityExtractor** (converts free-form queries into candidate entities) and **EntityResolver** (matches candidates to actual graph nodes with confidence scores). The extractor supports four extraction strategies in priority order: quoted strings, PascalCase/camelCase tokens, file paths (with extensions), and remaining significant nouns (filtering stop words and intent keywords). The resolver chains three matching strategies: exact name lookup (confidence 1.0), semantic/keyword search via FusionLayer (with configurable confidence > 0.5), and path-substring matching (confidence 0.6). Together, they form the front end of graph queries by bridging natural language to structured node lookups.

## Invariants

- Deduplication is mandatory — an entity matched by multiple extraction strategies (e.g., both quoted and in a file path) appears once in the result set
- Quoted-string priority — multi-word quoted strings extract as atomic units and their constituent words are NOT re-extracted as separate entities
- Stop-word and keyword filtering — common words (the, is, are, etc.) and intent markers (find, where, locate, search) are stripped before noun extraction
- Three-tier entity resolution — exact name match (confidence 1.0) → FusionLayer search (confidence tied to score, threshold > 0.5 strictly) → path substring match (confidence 0.6). First match wins
- FusionLayer threshold is exclusive — scores of 0.5 are rejected; only scores > 0.5 advance (score ≤ 0.5 → no resolution)
- FusionLayer always queries with topK=5 — even if fewer results are expected, the search boundary is fixed
- PascalCase/camelCase are extracted; SCREAMING_CASE are not — the extractor targets identifier naming conventions, not acronyms
- File-path extraction includes extensions — .ts, .js, and relative paths (./) are recognized as path boundaries
- Trailing punctuation is stripped — extracted nouns like 'auth?' become 'auth'
- Exact name match is lexically strict — 'middleware' does not match 'middleware.ts'; fuzzy matching only enters at FusionLayer stage

## Interface Contract

```ts

```

## Dependency Slice

```
import { EntityExtractor } from '../../src/nlq/EntityExtractor.js'
import { EntityResolver } from '../../src/nlq/EntityResolver.js'
import { IntentClassifier } from '../../src/nlq/IntentClassifier.js'
import { ResponseFormatter } from '../../src/nlq/ResponseFormatter.js'
import { askGraph } from '../../src/nlq/index.js'
import { AskGraphResult, ClassificationResult, Intent, ResolvedEntity, StalenessQueryResult } from '../../src/nlq/types.js'
import from '../../src/query/ContextQL.js'
import { FusionLayer, FusionResult } from '../../src/search/FusionLayer.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { GraphEdge, GraphNode } from '../../src/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
