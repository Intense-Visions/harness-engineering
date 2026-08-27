---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

Add a budget governor for unattended dispatch (#1525). A per-period spend
envelope (`agent.budget`) is enforced on the real dispatch path: global envelope
exhaustion stops dispatch cleanly at a lane boundary (in-flight lanes are never
interrupted), and per-fleet sub-allocations let fleets sharing an envelope
respect their split under contention. The remaining-budget signal is exposed via
the orchestrator snapshot (`getSnapshot().budget`). The governor is off when
`agent.budget` is not configured.
