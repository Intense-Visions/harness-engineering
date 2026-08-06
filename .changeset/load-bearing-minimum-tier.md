---
'@harness-engineering/cli': minor
---

Add the `load-bearing-minimum` adoption tier, sitting between `intermediate` and
`advanced`. It is the minimum harness that still holds when the senior
disappears for two weeks: the intermediate mechanical gates (ESLint + layer
enforcement, a cyclomatic-complexity cap of 15, and a module-size cap) plus the
two agent-loop gates that catch regressions no one is watching for — multi-persona
review (`harness review-ci`) and the outcome-eval ship gate
(`harness outcome-eval-ci`) — wired into a scaffolded CI workflow, without the
full advanced-tier surface area.

Scaffold it with `harness init --level load-bearing-minimum` (or the
`init_project` MCP tool). The new `templates/load-bearing-minimum/` template
ships `harness.config.json`, `eslint.config.mjs`, a `.github/workflows/required-review.yml`
that runs both gates on pull requests, and `harness:review` / `harness:outcome-eval`
package scripts for running them locally. The `--level` enum in the config
schema, the template metadata schema, and the `init_project` MCP tool all accept
the new value.
