---
schemaVersion: 1
module: 'packages/graph/src/ingest'
sourceHash: 'b4e8b21ebc3387889287fca4367d340487f1b80f10133a855ffaada247d3686e'
compiledAt: '2026-08-28T01:22:11.705Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'BusinessKnowledgeIngestor.ts',
    'CanaryResultsIngestor.test.ts',
    'CanaryResultsIngestor.ts',
    'CodeIngestor.ts',
    'ContradictionDetector.ts',
    'CoverageScorer.ts',
    'DecisionIngestor.ts',
    'DesignIngestor.ts',
    'DiagramParser.ts',
    'GitIngestor.ts',
    'ImageAnalysisExtractor.ts',
    'KnowledgeDocMaterializer.ts',
    'KnowledgeIngestor.ts',
    'KnowledgeLinker.ts',
    'KnowledgePipelineRunner.ts',
    'KnowledgeStagingAggregator.ts',
    'RequirementIngestor.ts',
    'StructuralDriftDetector.ts',
    'TopologicalLinker.ts',
    'domain-inference.ts',
    'ingestUtils.ts',
    'knowledgeTypes.ts',
    'skip-dirs.ts',
  ]
---

## Interface Contract

```ts
export BusinessKnowledgeIngestor
export CanaryResultsIngestor
export CodeIngestor
export ContradictionDetector
export CoverageScorer
export D2Parser
export DEFAULT_BLOCKLIST
export DEFAULT_PATTERNS
export DEFAULT_SKIP_DIRS
export DecisionIngestor
export DesignIngestor
export DiagramEntity
export DiagramFormatParser
export DiagramParseResult
export DiagramParser
export DiagramRelationship
export GitIngestor
export ImageAnalysisExtractor
export KNOWLEDGE_NODE_TYPES
export KnowledgeDocMaterializer
export KnowledgeIngestor
export KnowledgeLinker
export KnowledgePipelineRunner
export KnowledgeStagingAggregator
export MermaidParser
export PlantUmlParser
export RequirementIngestor
export StructuralDriftDetector
export TopologicalLinker
export emptyResult
export hash
export inferDomain
export mergeResults
export resolveSkipDirs
export skipDirGlobs
```

## Dependency Slice

```
import { GraphStore } from '../store/GraphStore.js'
import { EdgeType, GraphEdge, GraphNode, IngestResult, NodeType } from '../types.js'
import { BusinessKnowledgeIngestor } from './BusinessKnowledgeIngestor.js'
import { CanaryResultsIngestor, CanaryRunRecordInput } from './CanaryResultsIngestor.js'
import { ContradictionDetector, ContradictionResult } from './ContradictionDetector.js'
import { CoverageReport, CoverageScorer } from './CoverageScorer.js'
import { DecisionIngestor } from './DecisionIngestor.js'
import { DiagramParser } from './DiagramParser.js'
import { AnalysisProvider, ImageAnalysisExtractor } from './ImageAnalysisExtractor.js'
import { KnowledgeDocMaterializer, MaterializeResult } from './KnowledgeDocMaterializer.js'
import { KnowledgeLinker } from './KnowledgeLinker.js'
import { GapEntry, GapReport, KnowledgeStagingAggregator, StagedEntry } from './KnowledgeStagingAggregator.js'
import { DriftFinding, DriftResult, KnowledgeSnapshot, KnowledgeSnapshotEntry, StructuralDriftDetector } from './StructuralDriftDetector.js'
import { DomainInferenceOptions, inferDomain, inferDomainShared } from './domain-inference.js'
import { createExtractionRunner } from './extractors/index.js'
import { emptyResult, hash, mergeResults } from './ingestUtils.js'
import { KNOWLEDGE_NODE_TYPES } from './knowledgeTypes.js'
import { D2Parser, DiagramFormatParser, DiagramParseResult, MermaidParser, PlantUmlParser } from './parsers/index.js'
import { DEFAULT_SKIP_DIRS, resolveSkipDirs } from './skip-dirs.js'
import { StrategySectionName } from '@harness-engineering/types'
import { minimatch } from 'minimatch'
import { execFile } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fsSync from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
```
