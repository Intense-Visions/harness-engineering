---
'@harness-engineering/cli': patch
---

fix(hooks): `block-no-verify` now recognises the git command however it is spelled (`\git`, `git.exe`, a path-qualified `.../git` or `C:\...\git.exe`), treats any abbreviation of `--no-verify` down to `--no-v` as the flag on every git subcommand, and blocks `-c core.hooksPath=...` / `--config-env core.hooksPath=...` on hook-running subcommands (commit, push, merge, rebase, am, pull, checkout, switch, cherry-pick, revert, worktree). (#2389)
