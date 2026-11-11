---
'@harness-engineering/cli': patch
---

`run_code_review` now reviews the diff it is given. It built each file's diff text
from a `diff` field that `parseDiff` never returns, so every file's content was an
empty string: depth calibration reported `changedLines: 0` for any diff, and risk-keyword
detection saw nothing but file paths and the commit message. It now splits the raw
diff per file (the same `buildDiffInfo` that `harness review-ci` uses).
