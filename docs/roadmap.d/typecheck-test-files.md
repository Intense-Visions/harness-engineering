---
slug: "typecheck-test-files"
milestone: "v5.0 — Enforcement Hardening"
order: 218
---

### Bring test files under a typechecked project — type-level test assertions are currently decorative

- **Status:** planned
- **Spec:** —
- **Summary:** No `tsc` project includes `packages/core/tests/**`: `packages/core/tsconfig.json` is `include: ['src/**/*']` with `exclude: [..., 'tests']`, `tsconfig.build.json` excludes tests too, the root config is `files: []` plus project references, and `vitest.config.mts` declares no `typecheck` block so vitest strips types without checking them. Measured: `tsc -p packages/core/tsconfig.json --noEmit --listFilesOnly | grep -c '/tests/'` returns **0**. The consequence is that every type-level assertion written in a test file is unenforced — a test can annotate a value with an interface, assert the interface's shape, and pass while the interface drifts. Found concretely during the duplication Phase 1 review: `packages/core/tests/duplication/barrel.test.ts` asserted "`DuplicationConfig` has exactly the four specified fields" over an object literal the test itself typed, and adding a fifth field to the real interface would have turned nothing red anywhere in the repo. The same hole makes a `import type`-only re-export test (its only runtime assertion being on a `Map` the test built) pass even if all four type exports were deleted from the barrel. Scope: decide per-package whether tests join the main project, get their own `tsconfig.test.json` referenced from the root, or are covered by vitest's `typecheck` mode; then make the gate real in CI. This is a cross-cutting enforcement gap, not a duplication-feature concern — the duplication tests were merely where it surfaced.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** —
