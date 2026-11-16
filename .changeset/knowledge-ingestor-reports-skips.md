---
'@harness-engineering/graph': patch
---

fix(graph): report knowledge files the business-knowledge ingestor cannot index, and count flat knowledge dirs in the gap report (#2236)

`BusinessKnowledgeIngestor.ingest` no longer drops a knowledge file silently. A file with no frontmatter, a missing `type` or `domain`, or a `type` outside the business-knowledge set now produces an `IngestResult.errors` entry naming the file and the reason, which `harness knowledge-pipeline` prints as an ingestion warning. Files whose frontmatter declares neither `type` nor `domain` (for example ADRs, owned by the decision ingestor) are still skipped quietly.

The gap report now assigns "documented" entries to domains the way the ingestor does: frontmatter `domain` first, falling back to the domain subdirectory. Flat files directly under the knowledge root are counted by their frontmatter `domain` instead of being ignored.
