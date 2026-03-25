# @harness-engineering/graph

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
