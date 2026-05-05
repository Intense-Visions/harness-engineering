---
'@harness-engineering/graph': patch
---

Round-trip `metadata.source` through `KnowledgeDocMaterializer` ↔ `BusinessKnowledgeIngestor` so materialized knowledge docs no longer appear as a second "unknown" source contradicting their original extractor. Closes #265.
