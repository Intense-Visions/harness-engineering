---
type: business_rule
domain: graph
tags: [integrity, security, persistence, merge, poison-key]
---

# Graph Integrity Rules

The GraphStore enforces several constraints to maintain data integrity and prevent security vulnerabilities.

## Poison Key Protection (SEC-NODE-001)

The `safeMerge` function rejects metadata keys `__proto__`, `constructor`, and `prototype` during node merge operations. This prevents prototype pollution attacks through malicious metadata injection.

## Edge Uniqueness

Edges are uniquely identified by the composite key `(from, to, type)` using a null-separated string (`${from}\0${to}\0${type}`). Duplicate edges merge their metadata but do not create additional edge records, preventing graph explosion.

## Node Merge Semantics

When adding a node with an existing ID, metadata is merged via `safeMerge` rather than replaced. This preserves annotation history from multiple ingestors contributing to the same node.

## Schema Versioning

Graph persistence requires schema version matching. On load, if `metadata.json` reports a different schema version than `CURRENT_SCHEMA_VERSION` (currently 1), the graph is marked stale and requires a full rebuild from sources. This prevents silent compatibility breaks.

## Persistence Guarantees

Large graphs (100MB+) use streaming JSON serialization to prevent OOM during save. Both `graph.json` and `metadata.json` are written in parallel via `Promise.all` for consistency. The graph directory is created recursively on first save.

## Query Indexing

The store maintains 3-level indexing (by-ID, by-from, by-to, by-type) for fast lookups. ContextQL traversal supports bidirectional search with configurable depth limits and observability pruning (auto-filters span/metric/log noise nodes).
