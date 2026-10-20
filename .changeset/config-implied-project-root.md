---
'@harness-engineering/cli': minor
---

`-c/--config` now selects the **project**, not just the config file. A command pointed at another project's config read that project's settings but scanned, measured and wrote to `process.cwd()` — a confident number for the wrong tree.

`check-arch` was fixed out of this shape under #911 (commit `9f322084c`, `options.cwd ?? path.dirname(configPath)`), but the fix was copied inline rather than shared, so the split survived in **19** sibling commands. `harness check-docs -c /other/project/harness.config.json` was the reported case: it read that project's `docsDir`/`rootDir` and then counted _this_ directory's documentation coverage.

**Fixed (19)** — now root on the directory that owns the config: `check-docs`, `check-deps`, `check-design`, `check-perf`, `check-vocabulary`, `check-operational-drift`, `check-phase-gate`, `audit-protected`, `cleanup`, `fix-drift`, `predict`, `release-inventory`, `snapshot` (`capture`, `trends`, `list`), `add`, `models` (`proposals`, `drift`), `ci check`, `comprehend`, `roadmap triage`, and the cross-check display inside `validate`.

**Migrated (3)** onto the same helper, so the rule has one implementation rather than 22 copies to keep in step: `check-arch`, `check-deployment`, `golden-build`.

Four of these **wrote** to the wrong tree, not just measured it: `fix-drift` rewrites documentation, `snapshot capture` persists an architecture timeline, `comprehend --changed --stage` compiles unit shards and `git add`s them, and `add` scaffolds new files. Reverting the fix and re-running the new `add` test created a file inside this repo — the same escape #911 reported for the arch baseline.

**Behaviour change beyond the bug, hence `minor` rather than `patch`.** `resolveProject` roots on the config it _found_, not only on an explicit `-c`. Two consequences:

- Running one of these commands from a **subdirectory** now measures the project root rather than the subdirectory. `validate` and `check-phase-gate` previously honoured an explicit `-c` but fell back to `process.cwd()` for a discovered config; they now behave like `check-arch`.
- `harness add doc foo` with no `-c`, run from a subpackage, now scaffolds into the **project root's** `docsDir` rather than the subpackage's. That is a write, so it is the one worth knowing about before upgrading.

Nothing changes when a command is run from the project root, which is how every invocation in this repo's own scripts and workflows calls them.
