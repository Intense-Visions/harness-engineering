---
'@harness-engineering/cli': patch
---

fix(cli): findConfigFile now checks the filesystem root itself, so a harness.config.json placed directly at the filesystem root is found instead of skipped by the exclusive `while (currentDir !== root)` loop bound.
