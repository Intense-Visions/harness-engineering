# Plan: classify entry points instead of suggesting deletion

**Date:** 2026-08-15 · **Spec:** `docs/changes/fix-dead-code-entrypoint-classification/proposal.md` · **Issue:** #1325 · **Tasks:** 7 · **Integration Tier:** small

## Goal

Stop the dead-code pipeline from recommending deletion of build entry points.
Classify unreachable files that match entry-point conventions as a distinct finding
(`reason: 'UNREFERENCED_ENTRY_POINT'`) in the detector, emit a non-delete
`configure-entrypoint` suggestion for them, never auto-delete them, and seed the
repo's real build entry points into `harness.config.json`. Genuine dead files are
unaffected.

## Observable Truths (Acceptance Criteria)

1. Unreachable `*.config.ts` → `DeadFile.reason === 'UNREFERENCED_ENTRY_POINT'`. **Gate:** detector test.
2. Unreachable `src/main.ts` → `DeadFile.reason === 'UNREFERENCED_ENTRY_POINT'`. **Gate:** detector test.
3. `generateSuggestions` for an `UNREFERENCED_ENTRY_POINT` file → a suggestion with `type === 'configure-entrypoint'`, `priority === 'low'`, and no `delete` suggestion for that file. **Gate:** suggestions test.
4. `createDeadFileFixes` for an `UNREFERENCED_ENTRY_POINT` file → no `delete-file` fix; a `NO_IMPORTERS` file still yields one. **Gate:** safe-fixes test.
5. A `NO_IMPORTERS` file still yields a `delete` suggestion. **Gate:** existing suggestions test stays green.
6. `pnpm turbo build --filter=@harness-engineering/core` + typecheck + entropy tests + lint all green. **Gate:** local run.
7. `harness.config.json` `entropy.entryPoints` includes the repo's real build entry points; config still schema-valid. **Gate:** build/CI config validation.

## Tasks (TDD order)

1. **Type: add `UNREFERENCED_ENTRY_POINT`** to `DeadFile['reason']` union in `packages/core/src/entropy/types/dead-code.ts`.
2. **Type: add `configure-entrypoint`** to `Suggestion['type']` union in `packages/core/src/entropy/types/fix.ts`.
3. **Detector (RED→GREEN):** add `isEntryPointConvention(path)` helper + apply it in `findDeadFiles` and `classifyUnreachableNode` in `packages/core/src/entropy/detectors/dead-code.ts`. Add fixtures (`src/main.ts`, `something.config.ts`) + detector tests (AC 1,2).
4. **Suggestions (RED→GREEN):** branch `deadFileSuggestion` on `reason` in `packages/core/src/entropy/fixers/suggestions.ts`; emit `configure-entrypoint` info suggestion for entry points. Add suggestions test (AC 3,5).
5. **Safe-fixes (RED→GREEN):** filter `UNREFERENCED_ENTRY_POINT` out of `createDeadFileFixes` in `packages/core/src/entropy/fixers/safe-fixes.ts`. Add safe-fixes test (AC 4).
6. **Config:** seed real build entry points into `harness.config.json` `entropy.entryPoints`.
7. **Validate:** build core, typecheck, run entropy dead-code + fixer + safe-fixes tests, lint, prettier, changeset.

## Uncertainties

- [ASSUMPTION] "info severity" maps to the suggestion `priority: 'low'` — `DeadFile`/`Suggestion` have no `info` severity enum, and adding one would ripple through unrelated consumers (YAGNI). Recorded as an assumption per the issue's "record as assumptions" instruction.
- [ASSUMPTION] Entry-point conventions cover config files (`*.config.{ts,mts,cts,js,mjs,cjs}`) and framework roots (`main.ts(x)`, `main.mts`, `app.module.ts`). Extensible constant; not exhaustive of every framework.
- [ASSUMPTION] Seeding extra `entryPoints` is safe because `resolveEntryPoints` maps them as literal paths with no on-disk existence gate (verified in `packages/core/src/entropy/entry-points.ts`).
- [ASSUMPTION] New finding type is a **minor** bump for `@harness-engineering/core` (new public reason/suggestion-type value), per the lane brief.
