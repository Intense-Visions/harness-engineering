---
'@harness-engineering/core': patch
'@harness-engineering/orchestrator': patch
---

chore(security): suppress self-referential SEC-\* scanner false positives

Reword comment-only false positives and add inline `harness-ignore`
suppressions for the security scanner's own definitional patterns
(`injection-patterns.ts`) and the anti-bypass hooks that necessarily name the
flags they block. Comment/suppression-only — no runtime behavior change.
