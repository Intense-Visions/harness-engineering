---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(core): `applyFixes` now writes delete-file backups under the project being fixed instead of `process.cwd()` (#2294). `FixConfig` gains an optional `projectRoot`; a relative `backupDir` resolves against it, and an absolute `backupDir` is used as-is. `harness fix-drift --no-dry-run` and the `detect_entropy` MCP tool's `autoFix` mode pass the project root, so the backup always lands in the same tree as the deletion.
