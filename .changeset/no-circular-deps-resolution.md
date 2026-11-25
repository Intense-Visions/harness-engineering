---
'@harness-engineering/eslint-plugin': minor
---

`no-circular-deps` now actually reports cycles. It was inert in real repos: extensionless specifiers never matched the linted file's key, so no cycle ever closed. The rule now resolves relative specifiers to real files (extensions, TS-ESM `.js` → `.ts`, `index.*`), keys files by absolute path (no more collisions between `packages/a/src/x.ts` and `packages/b/src/x.ts`), reads files outside the current run from disk so single-file runs such as lint-staged see the whole cycle, counts re-exports, and ignores type-only imports and exports. Expect new reports in repos that enable it; each one is a real runtime import cycle.
