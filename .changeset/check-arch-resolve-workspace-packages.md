---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

`deps.resolveWorkspacePackages` now also reaches the `layer-violations` collector of `harness check-arch` and the `deps` step of `harness ci check`, so with the flag on both report the same cross-package layer violations `harness check-deps` does (#2216). The flag stays off by default, and with it off both gates behave exactly as before.
