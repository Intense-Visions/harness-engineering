---
'@harness-engineering/cli': patch
---

Fix hook refresh failure after global install. `resolveHookSourceDir()` path resolution failed in bundled dist layout, and `copy-assets.mjs` was not copying hook scripts to `dist/hooks/`.
