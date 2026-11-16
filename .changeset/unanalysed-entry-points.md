---
'@harness-engineering/core': patch
---

Fail a dead-code run on an entry point that exists on disk but is never analysed (#2296). A configured or auto-detected entry point dropped from the analysed file set — by an exclude pattern, an extension outside `include`, or a directory the walker always skips (a `package.json` `main: dist/index.js`) — used to pass the existence check and then contribute no reachability, so everything only it reached reported dead with no error. `buildSnapshot` now returns `ENTRY_POINT_NOT_ANALYSED` naming those entries, with the same gating as #2275's `ENTRY_POINT_NOT_FOUND`: fatal when dead-code analysis is requested, carried as `snapshot.entryPointsError` otherwise.
