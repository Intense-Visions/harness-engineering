---
'@harness-engineering/cli': minor
---

`-c/--config` now selects the **project**, not just the config file. A command pointed at another project's config read that project's settings but scanned, measured and wrote to `process.cwd()` — a confident number for the wrong tree.

`check-arch` was fixed out of this shape under #911 (commit `9f322084c`, `options.cwd ?? path.dirname(configPath)`), but the fix was copied inline rather than shared, so the split survived in sixteen sibling commands. `harness check-docs -c /other/project/harness.config.json` was the reported case: it read that project's `docsDir`/`rootDir` and then counted _this_ directory's documentation coverage.

**Fixed** (now root on the directory that owns the config): `check-docs`, `check-deps`, `check-design`, `check-perf`, `check-vocabulary`, `check-operational-drift`, `audit-protected`, `cleanup`, `fix-drift`, `predict`, `release-inventory`, `snapshot` (`capture`, `trends`, `list`), `add`, `models` (`proposals`, `drift`), `ci check`, and the cross-check display inside `validate`.

Two of these **wrote** to the wrong tree, not just measured it: `fix-drift` rewrites documentation and `snapshot capture` persists an architecture timeline, so a misrouted root edited a project the caller never named. `add` scaffolded its new files there too — reverting the fix and re-running the new test created a file inside this repo, which is the same escape #911 reported for the arch baseline.

**Behaviour change beyond the bug, hence `minor` rather than `patch`.** `resolveProject` roots on the config it _found_, not only on an explicit `-c`. So running one of these commands from a **subdirectory** of a project now measures the project root rather than the subdirectory. `validate` and `check-phase-gate` previously honoured an explicit `-c` but fell back to `process.cwd()` for a discovered config; they now behave like `check-arch`. Nothing changes when a command is run from the project root, which is how every invocation in this repo's own scripts and workflows calls them.

All sixteen now go through one shared `resolveProject(configPath, cwdOverride)` in `packages/cli/src/config/loader.ts`, and `check-arch`, `check-deployment` and `golden-build` were migrated onto it as well, so there is a single implementation of the rule instead of nineteen copies of it to keep in step.
