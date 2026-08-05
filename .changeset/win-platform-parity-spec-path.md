---
'@harness-engineering/cli': patch
---

Fix two Windows platform-parity failures: `resolveSpecPath` in `outcome-eval-ci` now normalizes joined paths to forward slashes so spec identity is stable across platforms (it previously emitted backslashes on Windows), and the `roadmap install-hook` executable-bit test assertion is now guarded to non-Windows, matching the `chmodSync` platform guard from #1092 (chmod is a no-op on Windows).
