---
'@harness-engineering/cli': patch
---

`harness check-arch` no longer warns that `complexity` or `circular-deps` "measured nothing" for a declaration-only, types-only or import-free package. A zero `functionsAnalyzed` or `edgeCount` now counts as an abstention only when no real files were analysed (`filesAnalyzed` is 0 or absent); over real files it is a clean result (#2317).
