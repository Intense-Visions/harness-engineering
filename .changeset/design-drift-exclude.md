---
'@harness-engineering/cli': patch
---

Support path exclusions for the design-token drift linter via `design.exclude`.
The linter now honors a `design.exclude` glob list (minimatch), stacked on top
of the project-wide `analysis.exclude` — letting monorepos scope DRIFT-\* findings
out of token-palette sources, test files, and non-UI code. This also makes the
drift linter honor `analysis.exclude`, which every other analysis scanner already
respects. Default behavior is unchanged when neither is configured.
