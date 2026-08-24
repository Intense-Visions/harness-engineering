---
'@harness-engineering/cli': patch
---

usage daily: accept `--limit <n>` as the canonical "how many rows" flag (matching `usage sessions --limit`). `--days <n>` keeps working as a hidden, deprecated alias that prints a one-line deprecation notice to stderr. Non-breaking; no subcommands renamed.
