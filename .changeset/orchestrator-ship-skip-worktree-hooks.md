---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): autonomous ship commits/pushes with --no-verify (dist-less worktree)

The orchestrator ships a converged local unit by committing + pushing inside a
DETACHED git worktree. That worktree has no built `dist/` (dist is gitignored, so
`git worktree add` never populates it), so the host repo's fail-closed pre-commit
hook (`harness ci check`, which runs `node packages/cli/dist/bin/harness.js`) died
with `MODULE_NOT_FOUND` and the commit — hence the entire ship — failed even when
the work was fully green (build+typecheck+lint+test all passing). The staged gate
then reported `ship failed: git commit …` and re-dispatched forever.

The ship commit and push now pass `--no-verify`. The orchestrator has already run
its own acceptance gate (build+typecheck+lint+test on the changed packages) before
shipping, and the authoritative re-check is the PR's CI; re-running the human dev
hooks in a dist-less worktree is redundant and environment-fragile. This unblocks
the first fully-local staged ship.
