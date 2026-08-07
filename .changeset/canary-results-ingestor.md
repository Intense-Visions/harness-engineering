---
'@harness-engineering/graph': minor
'@harness-engineering/cli': patch
---

Add `CanaryResultsIngestor` — turns canary run history into `test_result` nodes
(per run + per test) with `tested_by`/`failed_in` edges, reusing existing graph
node/edge types (no schema bump). Wire `ingest_source({ source: 'test-results' })`
to read records via the canary adapter (CLI layer) and drive the graph-only
ingestor; a no-op when canary has produced no results. `CanaryResultsIngestor`
imports no canary code, so `@harness-engineering/graph` stays free of canary
coupling.
