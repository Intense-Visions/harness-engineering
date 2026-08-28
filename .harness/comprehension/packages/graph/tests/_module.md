---
schemaVersion: 1
module: 'packages/graph/tests'
sourceHash: 'd30a32e97810bd375fba2fdcc79f554f2912c8cbc2ab8d914fbe45a4b423dc39'
compiledAt: '2026-08-28T01:22:11.670Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['setup.ts']
---

## Summary

**packages/graph/tests** is a comprehensive 40+ test suite validating the graph knowledge-management engine that powers codebase analysis, semantic linking, constraint enforcement, and impact simulation. Organized into six major categories: integration tests (full pipeline workflows), ingest tests (code/knowledge extractors), schema/type tests (node/edge contracts), constraint tests (layer dependency rules), independence tests (task parallelization detection), and blast-radius tests (failure cascade simulation). All tests use Vitest with fresh GraphStore instances per test, fixture directories for sample data (**fixtures**/sample-project, **fixtures**/diagrams), and strict schema validation via GraphNodeSchema/GraphEdgeSchema.

## Invariants

- GraphStore is stateless per test — each test creates a fresh instance with no cross-test state or shared fixtures
- Schema validation is strict — all nodes/edges must pass GraphNodeSchema/GraphEdgeSchema parsing; invalid types or missing fields fail fast
- Fixture data must exist — integration tests depend on **fixtures**/sample-project/ (code files + ADRs) and **fixtures**/diagrams/; missing fixtures cause ingest failures
- TopologicalLinker must detect cycles — linking tests assert cycles.length === 0; circular imports fail, not allowed
- Import-graph traceability is deterministic — ContextQL queries return consistent node sets for given root and depth; relinking produces identical results
- Task independence requires file-level overlap detection — TaskIndependenceAnalyzer must catch shared files between tasks; empty arrays, duplicate IDs, and <2 tasks throw immediately
- Cascade simulator probability propagates through edges — blast-radius simulations compute cumulative failure probability along import chains; isolated nodes return empty layers
- Constraint adapters map file paths to layers — GraphConstraintAdapter enforces allowed-dependency rules by layer; violations are recorded; file paths must be project-relative
- Knowledge drift is content-hash–based — StructuralDriftDetector compares snapshots by entity ID + contentHash; identical snapshots produce zero drift score
- ADR documents edges are by symbol extraction — KnowledgeIngestor.ingestADRs parses ADR markdown for code symbols and creates documents edges to matching code nodes via substring/path matching

## Interface Contract

```ts

```

## Dependency Slice

```
import { afterEach, beforeEach } from 'vitest'
```
