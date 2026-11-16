---
'@harness-engineering/cli': patch
---

fix(cli): `assess_project`'s entropy check now counts the fields detect_entropy actually reports. It summed `drift.staleReferences`, `drift.missingTargets` and `deadCode.unusedExports`, which no entropy report carries, so documentation drift, dead exports and dead files counted 0 and the check passed over them. It now reads detect_entropy's summary payload (`totalIssues` + per-category counts), fails closed as "not measured" when that count is missing, and no longer overflows on large repos by serialising the full detailed report. The health snapshot behind `harness recommend` had the same phantom fields, so its `dead-code` and `drift` signals never fired from dead exports or drift; it now reads `deadCode.deadExports` and `drift.drifts`. (#2550)
