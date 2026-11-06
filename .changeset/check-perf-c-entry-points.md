---
'@harness-engineering/cli': patch
---

`harness check-perf -c <config>` now reads `performance.entryPoints` from the `-c` project's config instead of walking up from the current directory. Previously the scan was rooted on the `-c` project but used whichever project's entry points were found above `process.cwd()`.
