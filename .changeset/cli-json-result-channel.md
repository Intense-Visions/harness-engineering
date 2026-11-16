---
'@harness-engineering/cli': patch
---

fix(cli): keep `--json` results on stdout and failing exit codes: `linter validate --json` exits non-zero on an invalid config again, and `advise-skills --json` / `rollback evaluate` print their JSON result to stdout (unprefixed) instead of losing it to stderr (#2586).
