---
'@harness-engineering/cli': patch
---

`init_project` MCP tool can now render the opt-in `ci-required-review` and `ci-pre-merge-brief` templates: it gains a `template` input (precedence over `level`, like `harness init --template`) plus optional `runner`, `blockOn`, and `baseBranch` inputs that default to the same values `harness init` uses (one shared defaults helper, so the two entry points cannot drift). Previously the only route was `level`, which failed strict Handlebars rendering with `"baseBranch" not defined in [object Object]`. Missing template variables now surface as `missing template variable "<name>" (line N)`, and an unknown `runner`/`blockOn` is rejected with a clear error instead of rendering a broken workflow.
