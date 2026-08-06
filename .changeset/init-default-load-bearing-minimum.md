---
'@harness-engineering/cli': minor
---

Change the init default recommendation away from `basic` to
`load-bearing-minimum`. `harness init` (and the `init_project` MCP tool) now
scaffold the `load-bearing-minimum` tier when no `--level` is given, and the
`initialize-harness-project` skill recommends it for new projects — the minimum
harness that still holds when the senior reviewer is away, rather than the
no-thresholds `basic` template that does not deliver a load-bearing harness.

`basic` remains available as an explicit opt-down (`harness init --level basic`)
for teams that want the lightest possible touch. The `--level` option set is
unchanged; only the default and the skill's recommendation prose changed.
