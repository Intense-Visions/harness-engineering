---
'@harness-engineering/cli': patch
---

`assess_project`'s `perf` check can now fail. It counted `violations` / `issues` keys
that the `EntropyReport` returned by `check_performance` never has, so every run
reported `passed: true` with `issueCount: 0` whatever the analyzer found. It now reads
`summary.totalIssues`, and output without a numeric count fails the check instead of
passing it.
