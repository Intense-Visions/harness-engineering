---
'@harness-engineering/graph': patch
---

fix(graph): test-description extractor emits path-based `file:` IDs so `governs` edges resolve (#940)

The business-signal / test-description extractor ingest minted hash-based `file:<hash>`
IDs for its edge targets and node `location.fileId`, while the code scanner materializes
file nodes with path-based IDs (`file:<relativePath>`). The two schemes never matched, so
every `governs`/`documents` edge from an `extracted:*` node dangled by construction (e.g.
529 dangling edges in one repo). `ExtractionRunner` now emits the canonical
`file:${record.filePath}` ID for both the node location and the edge target; because the
runner already passes each extractor a repo-relative, POSIX-normalized path identical to
`CodeIngestor`'s, these IDs are byte-identical and the edges bind to the real file nodes.
