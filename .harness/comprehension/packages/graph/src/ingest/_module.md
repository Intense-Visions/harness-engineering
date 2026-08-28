---
schemaVersion: 1
module: 'packages/graph/src/ingest'
sourceHash: 'b4e8b21ebc3387889287fca4367d340487f1b80f10133a855ffaada247d3686e'
compiledAt: '2026-08-28T01:22:11.705Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

`packages/graph/src/ingest` extracts knowledge from code, documents, diagrams, tests, and images into a unified knowledge graph, then analyzes it through a 4-phase convergence pipeline: extract signals from multiple sources, reconcile pre/post snapshots to detect drift, identify documentation gaps, and remediate issues (create docs, remove stale nodes, flag contradictions). The module coordinates multiple specialized ingestors (code, business knowledge, decisions, diagrams, test results), detectors (drift via snapshot comparison, contradictions via Levenshtein similarity), and processors (gap reporting, coverage scoring, doc materialization). Domain-scoped analysis allows filtering by logical domain. Remediation loops until convergence (max 5 iterations, stopping when issues reduce or reach zero). A confidence floor gates low-confidence entries from disk writes while still reporting them. All errors from all ingestors are aggregated and surfaced together.

## Invariants

- Layer boundary enforced by schema inlining: Graph layer imports types-only from core; runtime constants (SolutionDocFrontmatterSchema, STRATEGY_REQUIRED_SECTIONS) are mirrored locally and verified by tests against canonical sources to catch divergence.
- Snapshot-based drift detection is the sole reconciliation mechanism: All change detection (new/stale/drifted/contradicting classifications) flows through pre/post KnowledgeSnapshot comparison using SHA-256 content hashes (8-char truncated). Changes outside snapshots are invisible.
- Domain-scoped filtering propagates through all phases: Every analysis operation (baseline-empty check, drift detection, gap reporting, coverage scoring) respects an optional domain filter; domain is inferred from path/content and threaded via DomainInferenceOptions into aggregator/scorer/materializer.
- Materialization confidence floor is load-bearing: Gap entries below 0.5 confidence are reported but never written to disk; human-authored nodes carry no confidence and bypass the floor entirely (#1335). Suppresses low-signal extraction noise from tracked docs tree.
- Remediation loop converges deterministically: Runs max 5 iterations, re-extracting and re-detecting after each remediation step; exits early when drift + gaps reach zero or stop decreasing (previous issue count check prevents oscillation).
- Contradictions are flagged, never auto-resolved: ContradictionDetector uses Levenshtein similarity (threshold 0.8) to find conflicting definitions; remediation classifies but never modifies contradicting nodes—human decision required.
- Pre/post snapshot separation in remediation: Each remediation iteration captures fresh pre-snapshot _before_ re-extraction to correctly classify findings; skipping this creates snapshot creep.
- Test file exclusion is mandatory, not optional: Code extraction always excludes test files and fixture trees via DEFAULT_EXTRACTION_EXCLUDE regardless of caller-supplied patterns (#1111); extractors record as 'extractor' not 'linker'.
- Staging deduplication by contentHash preserves confidence: When duplicate contentHashes arrive, highest-confidence entry wins; tiebreaker order is order-dependent (last write).
- CI mode is report-only for remediation: When `ci: true`, skip doc materialization and don't flag drifted entries (extraction + detection run, remediation is suppressed to avoid writes).
- Ingest errors accumulate and must surface unified: All ingestor errors (parse, frontmatter, file read) are collected into a single array and returned in the result; silent failures hide systemic issues (#504 §1).
- Knowledge node types are enumerated and stable: 11 types (business_fact, business_rule, business_process, business_term, business_concept, business_metric, decision, design_token, design_constraint, aesthetic_intent, image_annotation) are the only valid inputs; type mismatch in frontmatter validation rejects the entry.

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
