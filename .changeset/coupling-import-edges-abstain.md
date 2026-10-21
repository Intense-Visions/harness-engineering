---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

`check-arch` now abstains on the coupling gate when the snapshot carried no import edges even though the analysed files contain import statements — the hollow-parse shape from #2284 that previously classified as a clean `measured` zero (#2304). `importEdges: 0` alone is not treated as an abstention: a declaration-only or import-free package genuinely has no import edges, so the coupling collector now also reports `importStatements` (a text count of import syntax, computed only when `importEdges` is 0), and the CLI abstains only when that count is non-zero. Coupling metadata gains `importStatements` in that case; nothing changes when import edges are present.
