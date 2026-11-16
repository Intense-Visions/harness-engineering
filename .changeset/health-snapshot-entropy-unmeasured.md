---
'@harness-engineering/cli': patch
---

The skill-recommendation health snapshot now calls `detect_entropy` in summary mode. Detailed mode overflowed with `Invalid string length` on large repos and was recorded as zero entropy. A check whose tool errors, throws, or returns unparseable output is now `passed: false` with `measured: false`. It no longer reads as a clean pass with zero counts. A failed `assess_project` no longer passes every check by default. `detect_entropy`'s summary-mode `deadCode` category now also reports `deadExports`, `deadFiles` and `unusedImports` counts.
