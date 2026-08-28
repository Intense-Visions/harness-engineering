---
schemaVersion: 1
module: 'packages/graph/tests/ingest'
sourceHash: '8d5b6180ff6129f17f56e306657d919647faa1cd53073649799f2ab3822d6889'
compiledAt: '2026-08-28T01:22:11.824Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

**packages/graph/tests/ingest** validates a multi-stage knowledge-graph ingestion pipeline that transforms diverse external sources (code, markdown, diagrams, APIs) into a typed, queryable graph. The test suite (24 core tests + 16 submodule tests) covers three architectural layers:

**Ingestors** (11 tests) parse documents and create typed nodes: BusinessKnowledgeIngestor extracts rules/processes/metrics from YAML-fronted markdown; CodeIngestor handles polyglot source analysis (TypeScript, Python, Go, Rust, Java) with language-aware symbol extraction; specialized ingestors target ADRs, design tokens, requirements, Git history, and LLM-analyzed images.

**Detectors** (2 tests) identify consistency problems: ContradictionDetector finds value conflicts; StructuralDriftDetector tracks lifecycle changes (new/stale/drifted) by content hash.

**Linkers** (2 tests) create relationships: KnowledgeLinker matches nodes semantically; TopologicalLinker resolves imports and detects cycles.

**Extractors submodule** (7 tests) use multi-language pattern matching to emit normalized ExtractionRecords (HTTP routes, enums, validation rules, test descriptions) with stable IDs and framework-aware confidence scores.

**Connectors submodule** (9 tests) fetch data from external systems (GitHub CI, Confluence, Jira, Figma, Miro, Slack) via a uniform interface, handle auth gracefully, bound content via tiered condensing, and sanitize injection risks.

**Orchestration** (3 tests) compose layers: KnowledgePipelineRunner chains extraction→linking→detection; KnowledgeStagingAggregator deduplicates/ranks findings; KnowledgeDocMaterializer reverses the process (graph→markdown).

## Invariants

- Frontmatter is mandatory for knowledge documents — files lacking YAML frontmatter are rejected with 'no frontmatter found' errors; missing directories soft-fail with zero counts
- YAML quoted scalars must be stripped from field values themselves, not just preserved — a node with domain: 'cli' must be findable via domain: cli query
- Node IDs are namespace-scoped and immutable — prefixes prevent collisions (bk:solutions:<domain>:<slug>, bk:strategy:<kebab-section>, build:, issue:jira:); reusing an ID for different content violates invariant
- Edges reference existing nodes or are silently omitted — missing edge targets don't halt ingestion; edges to nonexistent nodes are dropped without error
- All ingestors/connectors return IngestResult, never throw on user errors — auth/config/format errors reported in .errors array; counts (nodesAdded, edgesAdded) always present
- Content is bounded via tiered fallback: passthrough → truncate → summarize — when summarization fails, fall back to truncation; defaults connector-specific (e.g., 8000 chars for Confluence)
- Injection-resistant sanitization strips markup and instructions — remove <system>, <prompt> tags, markdown system headers, and 'ignore instructions' patterns before storing in graph
- Domain inference is path-scoped and configurable — patterns like packages/<dir>, apps/<dir>, services/<dir> infer domain; .harness and node_modules are blocklisted
- Extraction record IDs are deterministic — two extractions of identical input yield identical IDs; enables deduplication and resumability
- Placeholder sections are silently skipped — strategy sections containing template text (<2-4 sentences. ...>) are not materialized; unknown section names are ignored
- Framework-aware extraction confidence scores: high-confidence frameworks (Express, Spring, Actix) score 0.8–0.9; pattern-based heuristics (net/http) score 0.6
- Class-level Java basePaths compose hierarchically — method-level @RequestMapping under a class-level basePath resolves to classPath/methodPath; class-level declarations themselves are not emitted as endpoints
- API retry is transparent and idempotent — status 429/503 and network errors retry exponentially; non-retryable (401/404) fail immediately; retries not reported as errors
- Metadata captures source-specific fields and audit flags — nodes store original source metadata (labels, status, priority), flag when content was condensed, record original length
- Contradiction detection is hash-based — value conflicts trigger when content hashes diverge; severity determined by impact classification
- Structural drift is tracked via snapshots — compares current vs. prior knowledge snapshots; categorizes as NEW (fresh, not current), STALE (current, not fresh), DRIFTED (same ID, different content)
- Sync state is persisted for resumability — SyncManager records last-sync timestamps and offsets to disk; re-running resumes from prior point rather than re-ingesting all

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
