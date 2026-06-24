---
'@harness-engineering/cli': minor
---

Add `canary_probe` and `canary_recommend_framework` MCP tools wrapping the canary adapter, and wire them into the `harness-test-advisor` Coverage Audit. The audit now probes canary availability (Audit Phase 0) and degrades gracefully with an install nudge when the CLI is absent, and uses deterministic framework recommendations for uncovered files (falling back to the `canary:canary-pick-framework` plugin when degraded). The generative plugin Quality Review path is unchanged. Phase 2 of the canary-test-integration spec.
