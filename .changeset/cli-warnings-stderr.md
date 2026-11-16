---
'@harness-engineering/cli': patch
---

fix(cli): keep `--json` stdout machine-readable — `logger.warn` now writes to stderr (like `logger.error`), and in `--json` mode `logger.info`/`success`/`dim` also go to stderr, so `harness --json check-docs | jq` no longer fails on a leading warning line (#2519).
