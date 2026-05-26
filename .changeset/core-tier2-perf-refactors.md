---
'@harness-engineering/core': patch
---

Clear all 9 Tier 2 structural perf violations (`harness check-perf --structural`) in `packages/core`. Behavior-preserving refactors of `validateBranchName`, `isSanitizedResult`, `gatherDecayBlock`, `attributesToOTLP`, `OTLPExporter` constructor, `spansToOTLPJSON`, `metaToPatch`, `formatDiff`, and `metaFromFeatureFields`. Each function drops below its threshold (cyclomatic ≤ 10, nesting ≤ 4) via extract-method or destructuring-defaults; no API or wire-format changes; 2864/2864 core tests pass.
