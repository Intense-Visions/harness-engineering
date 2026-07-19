---
'@harness-engineering/cli': patch
---

Fix #862: warn on silently stripped/mis-nested harness.config.json keys. The
shared config loader now performs a schema-aware recursive diff of the raw JSON
against the zod schema and emits a non-fatal stderr warning naming each dropped
key (with a near-typo "did you mean" hint), while respecting `.passthrough()`
sections (security, performance) whose extra keys are intentionally kept. Load
still succeeds. Also declares the legitimate top-level `pulse` block on the
schema so it is no longer silently stripped.
