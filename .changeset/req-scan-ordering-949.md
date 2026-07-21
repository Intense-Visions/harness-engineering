---
'@harness-engineering/graph': patch
'@harness-engineering/cli': patch
---

Fix `@req` scan ordering (follow-up to #949): `harness graph scan` ingested code (which extracts `@req` annotations) BEFORE `RequirementIngestor` created the requirement nodes, so on a single `scan` every annotation logged "references non-existent requirement" and no `verified_by` edge formed — it only worked via the two-step `scan` then `ingest --all` workaround. `CodeIngestor.ingest` now accepts a `{ skipRequirementAnnotations }` option and exposes `linkRequirementAnnotations()`; `runScan` defers annotation linking until after requirement nodes exist. Convention-based requirement linking (which needs file nodes) is unaffected.
