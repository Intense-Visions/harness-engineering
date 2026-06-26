---
'@harness-engineering/cli': patch
---

Register `scan`, `query`, and `ingest` as subcommands of the `graph` command group (#644). Previously the `graph` group only exposed `status` and `export`, so `harness graph scan` failed with `unknown command 'scan'` — which also broke the post-update graph rebuild in `harness update` (its `runLocalGraphScan` invokes `harness graph scan .`). The top-level `harness scan`/`query`/`ingest` commands continue to work unchanged; both forms now resolve, and the `graph` group mirrors every operation defined under `commands/graph/`.
