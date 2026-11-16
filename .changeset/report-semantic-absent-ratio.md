---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Report the comprehension substrate's semantic present/absent ratio (#2063). `harness comprehend --stats` (and `--json comprehend --stats`) now reports how many committed units carry the semantic half versus static-only, and `harness comprehend --check` surfaces the absent ratio — a warning on `main`, info with `--context pr`. A new optional `comprehension.maxSemanticAbsentRatio` (default off) makes `--check` fail on `main` when the absent share exceeds it. Core's `runComprehendStats` / `runComprehendCheck` results gain a `semantic` coverage field, and `summarizeSemanticCoverage` is exported.
