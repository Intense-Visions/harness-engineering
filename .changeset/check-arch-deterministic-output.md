---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

`harness check-arch --json` (and `harness snapshot`) now produce byte-identical output for an unchanged tree. Collector results arrived in async file-discovery order, so `preExisting` and `thresholdViolations` were reordered on every run; a new core `sortMetricResults` helper puts results and their violations into a canonical order (category, scope, file, detail, id) before they reach the report, baseline and timeline writers.
