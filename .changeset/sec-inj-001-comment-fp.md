---
'@harness-engineering/orchestrator': patch
---

Fix a persistent SEC-INJ-001 false positive that reddened the `harness` CI check
on `main` and every branch off it. The security scanner's `eval/Function`
pattern (`/\beval\s*\(/`) matched the prose substring `eval (` in a code comment
(`execute-workflow.ts`: "Phase 3 gate eval (SC6-c)"), flagging it as
error-severity arbitrary-code-execution. Reworded the comment to "gate
evaluation" — no behavior change; the security check now passes cleanly.
