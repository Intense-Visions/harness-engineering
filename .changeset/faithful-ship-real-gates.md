---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): autonomous ship goes THROUGH the real gates (no --no-verify)

Reverses the earlier `--no-verify` shortcut. The autonomous ship now commits and
pushes through the real pre-commit + pre-push gates — exactly what a human push
hits — and fixes what they flag instead of bypassing them. The ship worktree builds
the CLI (`afterCreate`) so `harness ci check` actually runs, and `git()` now surfaces
the hook's output on failure so a block (missing changeset, formatting, arch
regression) flows into the staged-gate retry feedback. The local execution stage is
told to make the change mergeable — add a Changesets entry for a publishable package,
format, and fix new arch regressions — so the run converges on a genuinely mergeable
PR rather than one that skipped the release gate.
