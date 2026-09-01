---
'@harness-engineering/cli': patch
---

test: characterize `harness rehearse` (list/show/score) — the three action
handlers, `renderScore` + manifest rendering, and the `emitError` JSON-vs-human
dual output + exit-code contract (fail tier gates unless --report-only).
Behavior-only; no runtime change.
