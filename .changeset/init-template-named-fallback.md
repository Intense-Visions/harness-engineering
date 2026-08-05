---
'@harness-engineering/cli': patch
---

Make `harness init --template <name>` actually render standalone named templates.
`init` passes the `--template` value in as `level`, but `resolveTemplate` only
matched an adoption-level scaffold (`template.json.level`), so named templates
whose `template.json` declares no `level` (`ci-pre-merge-brief`, and even the
documented `orchestrator` example) failed with `Template not found for level: <name>`.
`resolveTemplate` now falls back to matching by template `name` when no level
matches, rendering that template standalone — honoring an explicit `extends` but
never dragging in the basic-level scaffold. `init` also supplies the
`runner`/`blockOn`/`baseBranch` defaults the `ci-pre-merge-brief` workflow needs
under strict-mode Handlebars. Level-based `init` is unchanged.
