---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Layer validation can now follow imports of workspace packages by name (`@scope/pkg`, `@scope/pkg/sub`), so layer `allowedDependencies` are enforced between packages instead of only within one (#2216). Opt in with `deps.resolveWorkspacePackages: true` in `harness.config.json` (core: `LayerConfig.resolveWorkspacePackages`); it is off by default because enabling it on an existing monorepo can surface violations that were previously never reported.
