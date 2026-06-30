---
'@harness-engineering/cli': patch
---

fix(cli): `check-perf` now loads the harness config so it resolves configured `entryPoints` on monorepos (previously failed with "Could not resolve entry points"). Also breaks two circular dependencies in the drift catalog and the craft LLM provider by extracting import-free type contracts (internal, no API change).
