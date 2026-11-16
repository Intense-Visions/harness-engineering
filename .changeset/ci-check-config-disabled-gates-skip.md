---
'@harness-engineering/core': patch
---

`harness ci check` now reports every config-disabled gate as `skip` instead of `pass`: `security.enabled: false`, `traceability.enabled: false`, `architecture.enabled: false` and `phaseGates.enabled: false` (or no `phaseGates` block) join `deps` / `entropy` / `performance`. A gate that did not run never reads as green; it is an acknowledged skip (no `skipReason`, not counted as an abstention), so the exit code is unchanged at `0`. The configuration reference's `entropy` intro no longer claims the block detects high-entropy strings — it configures drift, dead-code, pattern and duplication analysis.
