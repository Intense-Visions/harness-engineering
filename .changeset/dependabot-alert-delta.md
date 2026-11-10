---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
'@harness-engineering/graph': patch
'@harness-engineering/dashboard': patch
'@harness-engineering/eslint-plugin': patch
'@harness-engineering/linter-gen': patch
---

Align declared `minimatch` (`^11.0.4`) and `glob` (`^14.0.3`) ranges with the versions the root `pnpm.overrides` already resolve, so the published manifests no longer advertise the vulnerable `minimatch@10` / `glob@13` ranges that Dependabot alerts on. Resolved versions are unchanged (minimatch 11.0.4, glob 14.0.3).
