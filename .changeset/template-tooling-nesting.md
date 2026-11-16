---
'@harness-engineering/cli': patch
---

Fix `harness init` writing the toolchain block at the root of `harness.config.json`. The go/java/python/rust base templates and the post-init tooling step now nest it under `template.tooling`, the key the config schema reads, so newly scaffolded projects no longer print `ignored unknown key 'tooling'` and their declared linter/formatter/test runner is actually loaded. A legacy root-level `tooling` block is folded into `template.tooling` when init runs again. (#2475)
