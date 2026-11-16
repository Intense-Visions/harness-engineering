---
'@harness-engineering/cli': patch
---

The `check_dependencies` MCP tool now reads `harness.config.json` through the same `resolveDepsSettings` / `toLayerConfig` mapping as `harness check-deps` and the `harness ci check` deps step, so it honours `deps.exclude` and `rootDir` (previously ignored, so it reported violations the CLI had excluded and missed layers under a non-root `rootDir`). Its result also names the source files it could not parse in a new `unavailableChecks` field, with `abstentionDowngraded: true` under `deps.fallbackBehavior: 'warn'`, matching `check-deps`. Existing response fields are unchanged.
