---
'@harness-engineering/graph': patch
---

fix(graph): isolate per-connector failures in `SyncManager.syncAll`

A connector whose `ingest()` (or its per-connector metadata write) threw an
uncaught exception previously rejected the entire `syncAll()` run, silently
starving every connector registered after it and skipping the post-sync
KnowledgeLinker pass. `syncAll` now wraps each connector in a try/catch,
records the failure into the combined result's `errors` array, and continues
with the remaining connectors. Public return contract is unchanged.
