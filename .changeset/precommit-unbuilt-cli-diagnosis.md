---
---

Fix `.husky/pre-commit` misdiagnosing an unbuilt CLI as an architecture-baseline regression (#1421). The gate now asserts `packages/cli/dist/bin/harness.js` exists before invoking it and, when it does not (a fresh worktree/clone with no built CLI), fails with an accurate "the harness CLI is not built — run `pnpm build`" message instead of advising `--update-baseline`. Dev-tooling only; no publishable package changes.
