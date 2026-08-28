---
schemaVersion: 1
module: 'packages/graph/tests/ingest'
sourceHash: '8d5b6180ff6129f17f56e306657d919647faa1cd53073649799f2ab3822d6889'
compiledAt: '2026-08-28T01:22:11.824Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'BusinessKnowledgeIngestor.solutions.test.ts',
    'BusinessKnowledgeIngestor.strategy.test.ts',
    'BusinessKnowledgeIngestor.test.ts',
    'CodeIngestor-req-annotation.test.ts',
    'CodeIngestor-skip-dirs.test.ts',
    'CodeIngestor.multi-lang.test.ts',
    'CodeIngestor.test.ts',
    'ContradictionDetector.test.ts',
    'CoverageScorer.test.ts',
    'DecisionIngestor.test.ts',
    'DesignIngestor.test.ts',
    'DiagramParser.test.ts',
    'GitIngestor.test.ts',
    'ImageAnalysisExtractor.test.ts',
    'KnowledgeDocMaterializer.test.ts',
    'KnowledgeIngestor.test.ts',
    'KnowledgeLinker.test.ts',
    'KnowledgePipelineRunner.test.ts',
    'KnowledgeStagingAggregator.test.ts',
    'RequirementIngestor.test.ts',
    'StructuralDriftDetector.test.ts',
    'TopologicalLinker.test.ts',
    'domain-inference.test.ts',
    'edge-provenance.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { BusinessKnowledgeIngestor } from '../../src/ingest/BusinessKnowledgeIngestor.js'
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js'
import { ContradictionDetector } from '../../src/ingest/ContradictionDetector.js'
import { CoverageReport, CoverageScorer, DomainCoverageScore } from '../../src/ingest/CoverageScorer.js'
import { DecisionIngestor } from '../../src/ingest/DecisionIngestor.js'
import { DesignIngestor } from '../../src/ingest/DesignIngestor.js'
import { D2Parser, DiagramEntity, DiagramParseResult, DiagramParser, DiagramRelationship, MermaidParser, PlantUmlParser } from '../../src/ingest/DiagramParser.js'
import { GitIngestor, GitRunner } from '../../src/ingest/GitIngestor.js'
import { AnalysisProvider, AnalysisRequest, AnalysisResponse, ImageAnalysisExtractor, ImageAnalysisResult } from '../../src/ingest/ImageAnalysisExtractor.js'
import { KnowledgeDocMaterializer } from '../../src/ingest/KnowledgeDocMaterializer.js'
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js'
import { KnowledgeLinker, LinkResult } from '../../src/ingest/KnowledgeLinker.js'
import { KnowledgePipelineOptions, KnowledgePipelineRunner } from '../../src/ingest/KnowledgePipelineRunner.js'
import { GapEntry, KnowledgeStagingAggregator, StagedEntry } from '../../src/ingest/KnowledgeStagingAggregator.js'
import { RequirementIngestor } from '../../src/ingest/RequirementIngestor.js'
import { KnowledgeSnapshot, KnowledgeSnapshotEntry, StructuralDriftDetector } from '../../src/ingest/StructuralDriftDetector.js'
import { TopologicalLinker } from '../../src/ingest/TopologicalLinker.js'
import { inferDomain } from '../../src/ingest/domain-inference.js'
import { DEFAULT_SKIP_DIRS } from '../../src/ingest/skip-dirs.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { GraphEdge, GraphNode } from '../../src/types.js'
import * as fs from 'node:fs'
import * as fs, { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
