---
'@harness-engineering/cli': patch
---

The MCP stale-build message now reports the version actually installed on disk. It
read `package.json` through `require()`, whose process-wide cache still held the
manifest the server loaded at startup, so after an upgrade it named the old, running
version as "installed on disk". The manifest is now read fresh with `fs.readFileSync`.
