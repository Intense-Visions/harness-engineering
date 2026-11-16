---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

`harness ci check`'s deps step now honours `deps.exclude`, `deps.fallbackBehavior`, `deps.resolveWorkspacePackages` and `rootDir` from `harness.config.json`, like `harness check-deps` does. It also reports files that fail to parse: by default the step abstains (exit 3), and with `deps.fallbackBehavior: "warn"` it reports a warning. Before this change those files were skipped and the step still passed. Both commands now read these settings through one shared helper, `resolveDepsSettings` / `toLayerConfig` in core, so they can't get out of sync again (#2606).
