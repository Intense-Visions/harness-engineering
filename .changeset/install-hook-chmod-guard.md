---
'@harness-engineering/cli': patch
---

Guard the `chmodSync` in `harness roadmap install-hook` with a `process.platform !== 'win32'` check (regression from the initial install-hook landing) so the platform-parity gate passes and Windows adopters don't hit a chmod error.
