---
'@harness-engineering/graph': patch
---

fix(graph): a hard-failed connector sync no longer stamps a fresh "last synced" timestamp (#1336)

`SyncManager.sync()` wrote `lastSyncTimestamp: new Date().toISOString()` on every
run, including runs where `connector.ingest()` returned errors and ingested
nothing. `sync-metadata.json` is the one surface a human (and the
`harness graph integrity` GI-C001 check) reads for freshness, so a failed sync
read as freshly synced.

Now only a run with no errors advances the timestamp. A hard failure still records
its `lastResult` — so the errors stay visible — but preserves the previous
successful timestamp, or an empty string if the connector has never succeeded.
The failed run is no longer misrepresented as a successful one.
