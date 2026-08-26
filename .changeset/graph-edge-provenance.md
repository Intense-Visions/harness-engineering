---
'@harness-engineering/graph': minor
---

Add an optional `provenance` enum (`EXTRACTED | INFERRED | AMBIGUOUS`) on `GraphEdge`, set at ingest time so downstream adapters can distinguish relationships read directly from source from resolver/heuristic-derived ones. `CodeIngestor` stamps AST-explicit `contains` edges and the `@req`-annotation `verified_by` edge as `EXTRACTED`, and resolver-derived `imports`/`calls` edges as `INFERRED`; `TopologicalLinker` stamps directory-grouped module `contains` edges as `INFERRED`. The field is optional and back-compatible — existing edges without provenance still validate and round-trip through the store and NDJSON serializer.
