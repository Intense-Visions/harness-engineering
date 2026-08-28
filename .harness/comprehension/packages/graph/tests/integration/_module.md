---
schemaVersion: 1
module: 'packages/graph/tests/integration'
sourceHash: '5a005e661ace3cbe05da7629f727f3535e08a9fb7f35abc48a9b2189894f4d63'
compiledAt: '2026-08-28T01:22:11.735Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'community-detection.test.ts',
    'knowledge-pipeline-domain-config.test.ts',
    'knowledge-pipeline-materialization.test.ts',
    'knowledge-pipeline.test.ts',
    'scan-and-query.test.ts',
  ]
---

## Summary

`packages/graph/tests/integration` validates end-to-end graph workflows: ingesting real source code, linking it topologically, detecting semantic communities, and running the knowledge extraction pipeline. These tests operate on actual fixture projects and assert that complex multi-stage operations produce deterministic, durable results. The suite treats the graph as a state machine that must round-trip cleanly through save/load and produce consistent community assignments across runs. Main areas: community detection (semantic clusters assigned and serialized), knowledge pipeline domain config (path-based classification with configurable inference rules), and knowledge pipeline materialization (markdown generation in fix mode, inhibited in CI mode, with accurate gap analysis).

## Invariants

- Community labels survive serialization: after store.save() + store.load(), community IDs on every node must match pre-serialization values
- Community detection is deterministic: two independent graph builds from the same fixture produce identical communityCount and assignment arrays
- Community IDs are valid: every node's community must be a number in range [0, communityCount)
- Topological linking is a prerequisite: community detection on an unlinked graph produces incorrect or incomplete results
- KnowledgePipelineRunner is stateless: per-call inferenceOptions override runner defaults; no state carries between run() invocations
- Domain classification respects extraPatterns: the same node classified with and without extraPatterns: ['agents/<dir>'] lands in different domains
- CI mode blocks materialization: when ci: true, KnowledgePipelineRunner.run() must NOT create docs even with fix: true
- Fixture project ingests cleanly: sample-project fixture must ingest with errors: [] and nodeCount > 5
- Gap reports count accurately: result.gaps.totalExtracted and result.gaps.totalGaps reflect actual differential between extracted and documented nodes
- Materialization output is valid markdown: created docs must contain YAML frontmatter (---, type:, domain:)

## Interface Contract

```ts

```

## Dependency Slice

```
import { detectCommunities } from '../../src/community/detectCommunities.js'
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js'
import { DiagramParser } from '../../src/ingest/DiagramParser.js'
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js'
import { KnowledgePipelineRunner } from '../../src/ingest/KnowledgePipelineRunner.js'
import { KnowledgeStagingAggregator } from '../../src/ingest/KnowledgeStagingAggregator.js'
import { KnowledgeSnapshot, StructuralDriftDetector } from '../../src/ingest/StructuralDriftDetector.js'
import { TopologicalLinker } from '../../src/ingest/TopologicalLinker.js'
import { ContextQL } from '../../src/query/ContextQL.js'
import { FusionLayer } from '../../src/search/FusionLayer.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
