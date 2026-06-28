---
'@harness-engineering/orchestrator': patch
'@harness-engineering/cli': patch
---

Extract a shared `makeBackendResolver` helper (orchestrator package) used by both the CLI's `harness maintenance run --fix` backend resolution and the orchestrator's `createMaintenanceTaskRunner`, removing the duplicated `name → createBackend(def) | null` resolve logic that could drift. Behavior is unchanged.
