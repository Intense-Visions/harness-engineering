---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
'@harness-engineering/dashboard': patch
---

fix: register `scan` as a subcommand of the `graph` command group

`scan` was wired as a top-level `harness scan` command via the barrel
generator's `EXTRA_TOP_LEVEL_COMMANDS` list, while the post-update hook,
fallback hints, and docs all referenced `harness graph scan`. As a result
`harness graph scan` failed with `unknown command 'scan'` while the stale
top-level `harness scan` still resolved. The command now lives under the
`graph` group, and all user-facing hints point at `harness graph scan`.
