---
'@harness-engineering/core': patch
'@harness-engineering/intelligence': patch
'@harness-engineering/orchestrator': patch
'@harness-engineering/cli': patch
---

fix(triage): a fail-safe retrospective block is no longer counted as a graded mispredict. When the post-diff retrospective blocks because nothing could be judged (a missing or garbled prediction, or an unclassifiable actual), the `triage_outcome` event is still recorded for forensics but now carries `graded: false`, and the precedent base rate and the autonomy-ratchet sample skip it. The block still escalates exactly as before. Outcomes recorded before this change have no flag and aggregate exactly as they did.
