---
'@harness-engineering/graph': minor
'@harness-engineering/cli': minor
---

Add an optional `provenance` enum (`EXTRACTED | INFERRED | AMBIGUOUS`) on `GraphEdge`, set at ingest time so downstream adapters can distinguish relationships read directly from source from resolver/heuristic-derived ones. `CodeIngestor` stamps AST-explicit `contains` edges and the `@req`-annotation `verified_by` edge as `EXTRACTED`, and resolver-derived `imports`/`calls` edges as `INFERRED`; `TopologicalLinker` stamps directory-grouped module `contains` edges as `INFERRED`. The field is optional and back-compatible — existing edges without provenance still validate and round-trip through the store and NDJSON serializer.

The `get_relationships` MCP tool now consumes the field: it passes per-edge `provenance` through in detailed mode and adds a derived `provenanceBreakdown` (counts of `EXTRACTED`/`INFERRED`/`AMBIGUOUS`) to both summary and detailed responses, omitted gracefully for legacy graphs whose edges carry no provenance.
