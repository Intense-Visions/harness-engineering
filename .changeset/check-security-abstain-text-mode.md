---
'@harness-engineering/cli': patch
---

`harness check-security` no longer prints `v validation passed` in text mode when the scan matched 0 files. The abstention now renders as an unavailable check ("! Validation incomplete (1 check could not run)", and `[unavailable] …` under `--quiet`) instead of being silently dropped. `--json` output and exit codes are unchanged.
