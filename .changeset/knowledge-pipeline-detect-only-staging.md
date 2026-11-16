---
'@harness-engineering/graph': patch
'@harness-engineering/cli': patch
---

fix(knowledge-pipeline): detect-only runs (no `--fix`) no longer write `.harness/knowledge/staged/pipeline-staged.jsonl` — staging is a REMEDIATE step and now only happens behind `--fix`, as the skill documents. The "first run — no prior graph state" drift label is now shown only when the pre-extraction baseline was actually empty, not whenever every finding happens to be new.
