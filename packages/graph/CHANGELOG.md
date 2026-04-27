# @harness-engineering/graph

## 0.6.0

### Minor Changes

- Knowledge document materialization pipeline

  **@harness-engineering/graph:**
  - Add KnowledgeDocMaterializer that generates markdown knowledge docs from graph gap analysis
  - Wire KnowledgeDocMaterializer into pipeline convergence loop
  - Pass store to generateGapReport for differential gap analysis
  - Add materialization field to KnowledgePipelineResult
  - Fix filePath normalization to forward slashes for Windows compatibility
  - Fix conditional spread for exactOptionalPropertyTypes compatibility
  - Address review findings in knowledge pipeline
  - Add integration tests for pipeline materialization

  **@harness-engineering/cli:**
  - Display differential gaps and materialization results in knowledge-pipeline output

  **@harness-engineering/dashboard:**
  - Add knowledge pipeline to skill registry

## 0.5.0

### Minor Changes

- f62d6ab: Knowledge pipeline (Phases 4-5)

  **@harness-engineering/graph:**
  - Add KnowledgePipelineRunner with 4-phase convergence loop for end-to-end knowledge extraction
  - Complete Phase 4 knowledge pipeline with D2/PlantUML parsers, staging aggregator, and CLI integration
  - Add Phase 5 Visual & Advanced pipeline capabilities
  - Add DiagramParseResult types and MermaidParser for diagram-to-graph ingestion
  - Add StructuralDriftDetector with deterministic classification
  - Add ContentCondenser with passthrough and truncation tiers
  - Add KnowledgeLinker with heuristic pattern registry, clustering, staged output, and deduplication
  - Add code signal extractors for business knowledge extraction
  - Add business knowledge foundation with `business_fact` node type and `maxContentLength` config field
  - Add `execution_outcome` node type and `outcome_of` edge type

  **@harness-engineering/cli:**
  - Add Phase 5 Visual & Advanced pipeline capabilities
  - Add business-signals source to graph ingest

- f62d6ab: Add multi-language support for Python, Go, Rust, and Java in code signal extraction and graph ingestion

### Patch Changes

- f62d6ab: Enhance external connectors
  - Enhance JiraConnector with comments, acceptance criteria, custom fields, and condenseContent
  - Enhance ConfluenceConnector with hierarchy edges, labels, and condenseContent
  - Enhance SlackConnector with thread replies, reactions, and condenseContent
  - Add retry with exponential backoff to all connectors
  - Wire KnowledgeLinker into SyncManager post-processing

- f62d6ab: Reduce cyclomatic complexity across graph modules and update arch baselines
- f62d6ab: Fix OOM and stability issues
  - Resolve OOM in CodeIngestor and optimize directory traversal
  - Prevent OOM during graph serialization by streaming JSON output
  - Add missing NodeType import in CoverageScorer
  - Add missing lokijs runtime dependency
  - Relax flaky timing assertion and increase graph test timeout
  - Address integrity review suggestions across pagination, logging, and observability

- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6

## 0.4.3

### Patch Changes

- Sync VERSION constant to match package.json
- Document PackedSummaryCache, normalizeIntent, and CacheableEnvelope in API reference

## 0.4.2

### Patch Changes

- Add missing `finalizeCommit` function, fix unused parameter, and reduce Tier 2 structural complexity

## 0.4.1

### Patch Changes

- Reduce cyclomatic complexity in `Traceability` query and `GraphStore`

## 0.4.0

### Minor Changes

- Spec-to-implementation traceability — requirement nodes, coverage matrix, hybrid test linking

## 0.3.5

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.7.0

## 0.3.4

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.6.0

## 0.3.3

### Patch Changes

- Reduce cyclomatic complexity across graph modules

## 0.3.2

### Patch Changes

- # Orchestrator Release & Workspace Hardening

  ## New Features
  - **Orchestrator Daemon**: Implemented a long-lived daemon for autonomous agent lifecycle management.
    - Pure state machine core for deterministic dispatch and reconciliation.
    - Multi-tracker support (Roadmap adapter implemented).
    - Isolated per-issue workspaces with deterministic path resolution.
    - Ink-based TUI and HTTP API for real-time observability.
  - **Harness Docs Pipeline**: Sequential pipeline for documentation health (drift detection, coverage audit, and auto-alignment).

  ## Improvements
  - **Documentation Coverage**: Increased project-wide documentation coverage to **84%**.
    - Comprehensive JSDoc/TSDoc for core APIs.
    - New Orchestrator Guide and API Reference.
    - Unified Source Map reference for all packages.
  - **Workspace Stability**: Resolved all pending lint errors and type mismatches in core packages.
  - **Graceful Shutdown**: Added signal handling and centralized resource cleanup for the orchestrator daemon.
  - **Hardened Security**: Restricted orchestrator HTTP API to localhost.

- Updated dependencies
  - @harness-engineering/types@0.3.0

## 0.3.1

### Patch Changes

- Remove redundant `undefined` from optional parameters

## 0.3.0

### Minor Changes

- **GraphAnomalyAdapter** — Tarjan's articulation point detection, Z-score statistical outlier detection, overlap computation for graph anomaly analysis
- Export GraphAnomalyAdapter from package index

### Patch Changes

- Address code review findings for GraphAnomalyAdapter

## 0.2.2

### Patch Changes

- Fix `exactOptionalPropertyTypes` build error in `DesignIngestor.parseAestheticDirection()`
- Align dependency versions across workspace: `typescript` ^5.9.3

## 0.2.1

### Patch Changes

- Add missing license field (MIT) to package.json

## 0.2.0

### Minor Changes

- Add Confluence and CI (GitHub Actions) connectors for external data ingestion
  - `ConfluenceConnector`: ingests pages as `document` nodes with pagination support
  - `CIConnector`: ingests workflow runs as `build` and `test_result` nodes, links to commits
- Add `GraphFeedbackAdapter` for feedback system bridging
  - `computeImpactData()`: finds affected tests, docs, and downstream dependents for changed files
  - `computeHarnessCheckData()`: counts constraint violations, undocumented files, unreachable nodes
- Add `GraphConstraintAdapter` for constraint system bridging
  - `computeDependencyGraph()`: extracts file nodes and imports edges from graph
  - `computeLayerViolations()`: detects cross-layer violations using graph edges
- Export all adapters and connector types from package index

### Patch Changes

- Fix `exactOptionalPropertyTypes` build errors in `GraphEntropyAdapter` interfaces

## 0.1.0

### Minor Changes

- Initial release: Unified Knowledge Graph for AI-powered context assembly
  - `GraphStore`: LokiJS-backed in-memory graph with CRUD, edge deduplication, persistence
  - `VectorStore`: Brute-force cosine similarity search with serialize/deserialize
  - `ContextQL`: BFS traversal with depth limiting, type/edge filters, observability noise pruning
  - `FusionLayer`: Hybrid keyword + semantic search with configurable weight fusion
  - `CodeIngestor`: Async regex-based TypeScript parsing with method/variable/calls extraction
  - `GitIngestor`: Git log parsing, commit nodes, co_changes_with edges
  - `KnowledgeIngestor`: ADR/learning/failure ingestion with word-boundary code linking
  - `TopologicalLinker`: Module grouping and DFS cycle detection
  - `Assembler`: Graph-driven context assembly with intent-based search, budget management
  - `GraphEntropyAdapter`: Bridges graph queries to entropy-compatible formats
  - Connector architecture: `GraphConnector` interface, `SyncManager`, `JiraConnector`, `SlackConnector`
  - 24 node types, 17 edge types, Zod schemas for validation
