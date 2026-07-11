---
'@harness-engineering/cli': patch
---

`harness hooks add` now resolves hook scripts from the bundled `dist/hooks/` layout. Previously it only probed the dev layout (`src/hooks/`), so every invocation on a published npm/mise install failed with "Hook scripts not found". It now shares `resolveHookSourceDir()` with `hooks init`, which already handled both layouts.
