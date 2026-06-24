---
'@harness-engineering/intelligence': minor
---

Add `createCanaryAdapter` — a total, gracefully-degrading boundary around the deterministic `canary` test CLI (`canary-test-cli`, declared as an optionalDependency). Exposes `probe()` (availability with a full degrade matrix: not-installed / binary-missing / exec-failed / bad-output), `recommendFramework(prompt)` (→ `canary recommend --json`), and `reviewTest(path, framework?)` (→ `canary review-test --json`), all zod-validated and never throwing on a missing or misbehaving CLI. The exec seam is injectable (`CanaryExec`) for testing. Phase 1 of the canary-test-integration spec; skill wiring and docs follow in later phases.
