---
'@harness-engineering/cli': minor
'@harness-engineering/core': minor
---

check-deps no longer fails on cycles inside vendored `node_modules`: the CLI
`findFiles` helper now applies core's shared `DEFAULT_FIND_FILES_IGNORE`. Adds a
`deps.exclude` config block (minimatch globs) to suppress additional paths from
check-deps discovery, threads it through both the layer-validation and
circular-detection paths, attributes circular findings to their first-cycle
file, and prints the analyzed-module denominator — failing rather than
reporting clean when layers are configured but zero modules are analyzed.
Exports `DEFAULT_FIND_FILES_IGNORE` from `@harness-engineering/core`. (#1188)
