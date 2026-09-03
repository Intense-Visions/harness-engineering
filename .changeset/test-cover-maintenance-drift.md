---
'@harness-engineering/cli': patch
---

test: characterize the `harness maintenance` command surface (list/show/run
action + render) and the `harness check-operational-drift` action + `printResult`
render layers (policy layering, ADR-in-diff pass, config-undiffable fallback,
strict override, exit codes). Behavior-only; no runtime change.
