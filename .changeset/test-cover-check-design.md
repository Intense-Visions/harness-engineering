---
'@harness-engineering/cli': patch
---

test: characterize `harness check-design` — verifier aggregation, craft
tier->severity mapping, the `valid`/degraded rules, and the command exit-code
contract (0 clean / 1 error / 2 degraded) plus JSON + human output. Behavior-only.
