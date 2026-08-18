---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(architecture): honor exclude patterns in the architecture collectors

`check-arch` measured every `.ts` file the walkers could reach, with no way to
scope discovery. Projects that contain source whose SHAPE is imposed by an
external runtime — sandboxed dataflow/edge scripts that cannot import shared
helpers and must inline everything into a single function — had no way to keep
those files out of the complexity aggregate. Because the ratchet compares
aggregates, a handful of such files can hold the entire gate red indefinitely,
and no amount of good work on the branch can clear it. This is the same defect
class as #594 (arch scanning built `dist/`), where discovery scope, not the
threshold, was the problem.

`architecture.excludePatterns` takes minimatch globs matched against the
project-relative POSIX path, mirroring `ingest.excludePatterns`. Patterns are
ADDITIVE: `DEFAULT_FIND_FILES_IGNORE` and `DEFAULT_SKIP_DIRS` still apply, so
setting one pattern never re-enables scanning of `node_modules` or `dist`. The
CLI additionally stacks the project-wide `analysis.exclude` list onto the arch
config, making `check-arch` consistent with the other analysis scanners that
already honor it.

Wired into the three glob-based collectors (complexity, circular-deps, coupling)
and the two directory walkers (module-size, dep-depth). `layer-violations` and
`forbidden-imports` route through `validateDependencies` and are unchanged.
Defaults to `[]`, so behavior is identical for every existing config.
