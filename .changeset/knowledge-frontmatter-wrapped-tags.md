---
'@harness-engineering/graph': patch
---

Knowledge and solution ingest no longer drop a frontmatter list that spans several lines. A `tags: [...]` list wrapped by prettier, or a block-sequence (`- item`) list, now comes through intact instead of leaving `metadata.tags` undefined (or, for solution docs where `tags` is required, rejecting the doc). Single-line values parse as before. (#2369)
