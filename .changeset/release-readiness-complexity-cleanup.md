---
'@harness-engineering/cli': patch
'@harness-engineering/dashboard': patch
'@harness-engineering/local-models': patch
'@harness-engineering/orchestrator': patch
---

Reduce cyclomatic complexity across dashboard pages/components, local-models,
orchestrator, and cli hooks via behavior-preserving extraction. No public API,
CLI contract, or runtime behavior changes; security-sensitive sentinel hooks
verified byte-identical in their detection rules. Resolves 18 baselined
architecture complexity violations and clears three new complexity regressions.
