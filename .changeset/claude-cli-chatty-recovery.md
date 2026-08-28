---
'@harness-engineering/intelligence': patch
---

ClaudeCliAnalysisProvider now recovers from chatty structured-output replies: it
salvages an embedded JSON object from a prose `result`, and on a schema mismatch
re-prompts the model once with its own rejected output demanding only JSON. This
fixes a ~20% semantic-generation miss observed on the `claude`-CLI subscription
path and benefits every AnalysisProvider consumer (acceptance_eval, outcome_eval,
comprehension).
