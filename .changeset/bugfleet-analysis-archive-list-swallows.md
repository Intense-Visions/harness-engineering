---
'@harness-engineering/orchestrator': patch
---

Scope `AnalysisArchive.list`'s ENOENT guard to the `readdir` instead of wrapping the per-file read loop too. One entry vanishing mid-scan discarded every record already read and reported the archive as empty, so the auto-publish and `publish-analyses` paths silently published nothing.
