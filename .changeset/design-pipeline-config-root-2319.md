---
'@harness-engineering/cli': patch
---

`harness design-pipeline -c <path>` now runs against the project that owns the config.
Before, the command ignored `-c` entirely: every phase scanned the current directory and
the verifiers read `design.*` from the current directory's `harness.config.json`, so a
run pointed at another project reported this project's findings instead. A `-c` that
cannot be loaded now exits with an error rather than falling back to the current
directory. Without `-c` the root is still the current directory.
