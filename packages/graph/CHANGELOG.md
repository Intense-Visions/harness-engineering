# @harness-engineering/graph

## 0.9.0

### Minor Changes

- bb7658b: fix(graph/ingest): materialize general Markdown as `document` nodes (#302); consolidate skip-dir usage across walkers and glob excludes

  **`@harness-engineering/graph`:**
  - Issue #302 — `KnowledgeIngestor.ingestAll()` only ran `ingestADRs`, `ingestLearnings`, and `ingestFailures`. Top-level `README.md`/`AGENTS.md` and `docs/**/*.md` (non-ADR) were silently skipped, so no `document` nodes existed and no `documents` edges were created for general docs. The `detect-doc-drift` skill's graph-enhanced traversal was a no-op on any project without a `docs/adr/` directory.
  - New `KnowledgeIngestor.ingestGeneralDocs(projectPath)` materializes `document` nodes for top-level `*.md` (non-recursive) and `docs/**/*.md` (recursive), skipping subdirs owned by sibling ingestors (`docs/adr` → `ingestADRs`, `docs/knowledge` → `BusinessKnowledgeIngestor`, `docs/changes` → `RequirementIngestor`, `docs/solutions` → solutions pipeline). Node id format: `doc:<rel-path>`. Title parsed from the first H1, falling back to the filename. Runs `linkToCode(content, nodeId, 'documents')` so mentioned code symbols get `documents` edges automatically. Wired into `ingestAll()`, so both the MCP `ingest_source` (knowledge|all) handler and the CLI `harness ingest --source knowledge` path benefit without further changes.
  - New `skipDirGlobs(skipDirs?)` helper exported from `@harness-engineering/graph`. Converts a skip-dirs set (default: `DEFAULT_SKIP_DIRS`) into minimatch glob patterns of the form `**/<name>/**`. Use this for tools that exclude via globs (security scan, doc coverage, entropy snapshot) instead of by reading directory names during traversal — the previously hand-maintained `['**/node_modules/**', '**/dist/**']` mini-lists across packages now derive from the canonical 60+ entry set automatically.
  - Consolidated all hand-rolled skip-dir lists inside the graph package around `DEFAULT_SKIP_DIRS`: `KnowledgeIngestor.findMarkdownFiles`, `BusinessKnowledgeIngestor.findMarkdownFiles` (the byte-identical twin of the #302 bug), `DiagramParser.findDiagramFiles`, `ExtractionRunner.walkSources`. Each picks up the full coverage from #274 (Python `__pycache__`/`.venv`, JS framework caches `.next`/`.turbo`/`.vite`, AI agent sandboxes `.claude`/`.cursor`/`.codex`, etc.) for free, and any future addition to `DEFAULT_SKIP_DIRS` propagates everywhere.

  **`@harness-engineering/core`:**
  - `architecture/collectors/module-size.ts` and `architecture/collectors/dep-depth.ts`: `isSkippedEntry` now combines `name.startsWith('.')` with `DEFAULT_SKIP_DIRS.has(name)`. Preserves the existing broad dotfile heuristic and adds curated non-dotfile names (`vendor`, `out`, `target`, `build`, `coverage`, etc.).
  - `entropy/detectors/size-budget.ts:dirSize`: skip-set widened from `{node_modules, .git}` to the full `DEFAULT_SKIP_DIRS`. Size budgets now exclude `dist`, `build`, `.turbo`, etc., matching intent.
  - `performance/critical-path.ts`: source-file walker uses `DEFAULT_SKIP_DIRS`.
  - `security/types.ts:DEFAULT_SECURITY_CONFIG.exclude` and `security/config.ts:SecurityConfigSchema.exclude`: default exclude list is now `[...skipDirGlobs(), '**/*.test.ts', '**/fixtures/**']` — file-type/fixture filters preserved, dir-skip portion derives from the canonical set.
  - `ci/check-orchestrator.ts`: same treatment for the two `excludePatterns` defaults (doc-coverage fallback and security-scan ignore fallback).
  - `entropy/snapshot.ts`: `excludePatterns` fallback now derives from `skipDirGlobs()`. Also corrects a latent bug — the previous `'node_modules/**'` (no leading `**/`) only matched top-level `node_modules`, missing nested ones in monorepos.

  **`@harness-engineering/cli`:**
  - `commands/migrate.ts:walk`: skip-set uses `DEFAULT_SKIP_DIRS`.
  - `commands/install.ts`: skill-scan walker combines `startsWith('.')` with `DEFAULT_SKIP_DIRS.has(name)`.
  - `config/schema.ts:EntropyConfigSchema.excludePatterns`: default is now `[...skipDirGlobs(), '**/*.test.ts']`.

  **Tests:**
  - New `general docs ingestion (issue #302)` block in `packages/graph/tests/ingest/KnowledgeIngestor.test.ts`: 5 cases covering top-level README/AGENTS creation, `documents`-edge linking to mentioned code symbols, ADR non-duplication, ownership-aware subdir skipping (`docs/{adr,knowledge,changes,solutions}`), and `.harness/*.md` exclusion. Revert-and-fail check confirms 3 of the 5 fail without the fix; the remaining 2 guard against future over-ingestion.
  - Updated `packages/cli/tests/commands/install.test.ts` `child_process` mock to use `importOriginal()` partial pattern so transitively-loaded code from `@harness-engineering/graph` resolves correctly.

## 0.8.0

### Minor Changes

- fix(ingest, graph): resolve `harness ingest` OOM/recursion crashes (#274) and `loadGraph` V8 string-cap crashes (#276) on real-world monorepos.

  **`@harness-engineering/graph`:**
  - Issue #274 — recursive walker with a 22-entry inline if-chain skip list crashed with `Maximum call stack size exceeded` or heap-OOM on monorepos with populated build caches. The skip list missed `.turbo`, `.vite`, `.cache`, `.docusaurus`, `.wrangler`, `.svelte-kit`, `.parcel-cache`, `storybook-static`, `playwright-report`, `test-results`, `.pytest_cache`, `.pnpm-store`, `.nuxt`, and AI agent sandbox dirs (`.claude`, `.cursor`, `.codex`, `.gemini`, `.aider`). The `.claude/worktrees/` omission alone could multiply walker workload by 50× on heavy users of Claude Code's worktree feature.
  - New shared `DEFAULT_SKIP_DIRS` constant (60+ entries) at `packages/graph/src/ingest/skip-dirs.ts`, exported from the package barrel along with `resolveSkipDirs`. Covers VCS, package managers, JS/TS framework caches, test/coverage outputs, Python virtualenvs and bytecode, JVM build outputs, IDE metadata, and AI agent sandboxes.
  - `CodeIngestor.findSourceFiles` rewritten as an iterative BFS walker — no more recursion, bounded by frontier size rather than path depth.
  - New `CodeIngestorOptions` constructor parameter: `skipDirs` (replace defaults), `additionalSkipDirs` (extend defaults), `excludePatterns` (minimatch globs), `respectGitignore` (default-on, supports the common `.gitignore` subset; negation is dropped silently).
  - Issue #276 — `loadGraph` slurped `graph.json` into one V8 string and crashed with `RangeError: Invalid string length` on graphs > ~512 MB. Production monorepos with thousands of source files hit this easily.
  - On-disk schema bumped v1 → v2: `graph.json` is now NDJSON, one record per line with a `kind` discriminator (`"node"` or `"edge"`). Reader uses `readline` so peak string size is bounded by the largest single record. Old v1 graphs trigger the existing `schema_mismatch` path → automatic rebuild on next scan.
  - New `loadGraphMetadata` helper (exported) reads only `metadata.json`. New `nodesByType` field on `GraphMetadata` enables a fast-path for summary callers that never touch `graph.json`.
  - `RangeError: Invalid string length` now wraps into an actionable error pointing at the offending file and likely cause.

  **`@harness-engineering/cli`:**
  - New `ingest` config block on `HarnessConfigSchema` mirroring `CodeIngestorOptions`. Use `additionalSkipDirs` to extend the comprehensive defaults without replacing them, `excludePatterns` for glob-based exclusions, and `respectGitignore: false` to opt out of `.gitignore` honoring.
  - `harness scan` and `harness ingest --source code` load the `ingest` block via best-effort `loadIngestOptions` — if `harness.config.json` is missing or malformed, falls back to defaults silently.
  - `harness graph status` now reads only `metadata.json` (via `loadGraphMetadata`) and returns instantly with full per-type node breakdown, even on multi-GB graphs that previously failed to load.
  - `harness graph status` reports a clear `schema_mismatch` message instead of an opaque parse error when the graph was written by an older schema version.
  - The CLI's MCP `glob-helper` now imports the shared `DEFAULT_SKIP_DIRS` so the MCP file walker and the graph ingester can no longer drift.

  **Documentation:**
  - `docs/reference/configuration.md` — new `ingest` section documenting `skipDirs`, `additionalSkipDirs`, `excludePatterns`, `respectGitignore`, the comprehensive default list, and a worked example.

  **Tests:**
  - New `packages/graph/tests/ingest/CodeIngestor-skip-dirs.test.ts` — asserts default coverage of `.claude`/`.vite`/`.turbo`/etc., custom `additionalSkipDirs`/`skipDirs`/`excludePatterns` work, `.gitignore` is honored, iterative walker handles deeply nested directories.
  - New `packages/graph/tests/store/Serializer.test.ts` — asserts NDJSON line shape, save/load roundtrip preserves nodes and edges, metadata fast-path returns counts without reading `graph.json`, schema-mismatch on legacy v1 files, large-graph (5K nodes + 5K edges) streams cleanly.
  - Existing `packages/cli/tests/commands/graph.test.ts` updated to assert the v2 NDJSON shape.

## 0.7.1

### Patch Changes

- 18412eb: Round-trip `metadata.source` through `KnowledgeDocMaterializer` ↔ `BusinessKnowledgeIngestor` so materialized knowledge docs no longer appear as a second "unknown" source contradicting their original extractor. Closes #265.

## 0.7.0

### Minor Changes

- 3bfe4e4: feat: configurable domain inference for the knowledge pipeline.

  **`@harness-engineering/graph`:**
  - New shared helper `inferDomain(node, options)` at `packages/graph/src/ingest/domain-inference.ts`. Exported from the package barrel along with `DomainInferenceOptions`, `DEFAULT_PATTERNS`, `DEFAULT_BLOCKLIST`.
  - Built-in patterns cover common monorepo conventions: `packages/<dir>`, `apps/<dir>`, `services/<dir>`, `src/<dir>`, `lib/<dir>`.
  - Reserved blocklist prevents misclassification of infrastructure paths: `node_modules`, `.harness`, `dist`, `build`, `.git`, `coverage`, `.next`, `.turbo`, `.cache`, `out`, `tmp`.
  - Generic first-segment fallback after blocklist filter; preserves existing `KnowledgeLinker` connector-source branch and the `metadata.domain` highest-precedence behavior.
  - Refinements: code-extension allowlist (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) so directories with dots in names like `foo.bar/` retain their full segment; symmetric blocklist returns `'unknown'` when a pattern captures a blocklisted segment instead of bleeding into the generic fallback.
  - Wired into `KnowledgeStagingAggregator`, `CoverageScorer`, and `KnowledgeDocMaterializer`. Each gains an optional `inferenceOptions: DomainInferenceOptions = {}` constructor parameter — back-compat preserved for single-arg construction.
  - `KnowledgePipelineRunner` accepts `inferenceOptions` on its per-run options and threads to all four construction sites.
  - Test coverage: 19 unit tests for the helper + 11 wiring/integration tests across consumer classes + 3 end-to-end fixture tests.

  **`@harness-engineering/cli`:**
  - New optional config: `knowledge.domainPatterns: string[]` and `knowledge.domainBlocklist: string[]` on `HarnessConfigSchema`. Pattern format is the literal `prefix/<dir>` (regex `^[\w.-]+\/<dir>$`); blocklist entries are non-empty strings. Both default to `[]` and **extend** the built-in defaults rather than replacing them.
  - `harness knowledge-pipeline` reads both fields via `resolveConfig()` and maps them to the runner's `inferenceOptions.extraPatterns` / `extraBlocklist`.
  - 22 schema validation tests covering valid populated / valid empty / valid absent / invalid pattern / invalid blocklist element / default-propagation cases.

  **Documentation:**
  - `docs/reference/configuration.md` — new `knowledge` section documenting both fields, the built-in defaults, the precedence order, both refinements, and a worked `agents/<dir>` example.
  - `docs/knowledge/graph/node-edge-taxonomy.md` — new "Domain Inference" section with a 6-row precedence-walkthrough table.
  - `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` — one-line note in EXTRACT phase pointing at the config override.

  **Known follow-up:** Phase 6 verification showed the real-repo `unknown` bucket did not close as projected on this monorepo (helper + wiring + integration test all pass independently, but the production pipeline runtime path appears to lose `node.path` between extraction and aggregation). The diagnostic is filed as `Diagnose pipeline node-path loss for domain inference` on the roadmap.

  Spec: `docs/changes/knowledge-domain-classifier/proposal.md`. Verification report: `docs/changes/knowledge-domain-classifier/verification/2026-05-03-phase6-report.md`.

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
