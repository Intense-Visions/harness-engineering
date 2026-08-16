# fix-dead-code-entrypoint-classification — classify entry points instead of suggesting deletion

**Status:** Draft · **Tier:** Small · **Type:** bugfix (entropy dead-code detector + fixer)
**Issue:** #1325
**Keywords:** entropy, dead-code, reachability, entry-points, false-positive, suggestions, safe-fixes, config

## Overview

The dead-code detector treats every file that is unreachable from the configured
`entropy.entryPoints` as generic dead code. In
`packages/core/src/entropy/detectors/dead-code.ts` (`findDeadFiles`) each such file
is emitted as a `DeadFile` with `reason: 'NO_IMPORTERS'` and no entry-point
classification. Two downstream fixers then turn that finding into a **delete**
recommendation:

- `packages/core/src/entropy/fixers/suggestions.ts` (`deadFileSuggestion`) emits a
  high-priority `type: 'delete'` suggestion — "This file is not imported by any
  other file and can be safely removed."
- `packages/core/src/entropy/fixers/safe-fixes.ts` (`createDeadFileFixes`) emits an
  auto-applicable `action: 'delete-file'` fix for **every** dead file.

Build entry points are reachable at build/runtime, not through static
`import` edges: `vite.config.ts`, `vitest.config.ts`, `tsup.config.ts`,
`src/main.ts(x)` (Vue/Angular/React roots), `app.module.ts` (NestJS). When such a
file is not listed in `entropy.entryPoints` it is unreachable in the import graph and
gets a **delete** recommendation — the correct remediation is to declare it in
`entryPoints`, not to delete it. `harness.config.json` currently seeds only package
`index.ts` roots, so the repo's own build configs and framework roots are exposed to
this false positive.

## Goals

- Teach the detector to classify an unreachable file that matches an **entry-point
  convention** as a distinct finding (`reason: 'UNREFERENCED_ENTRY_POINT'`) instead
  of generic `NO_IMPORTERS` dead code.
- Make the suggestion fixer emit a **non-delete**, informational suggestion
  (`type: 'configure-entrypoint'`, low/info priority) for those files — "declare in
  entryPoints" — and never a delete suggestion.
- Make the auto-fix fixer **never** auto-delete an entry-point-convention file.
- Preserve existing behavior for genuinely orphaned files: they still get the delete
  suggestion and the delete-file fix.
- Seed the repo's obvious real build entry points into `harness.config.json`
  `entropy.entryPoints`.

## Non-goals (YAGNI)

- Detecting entry points by parsing build-tool configs or `package.json` scripts —
  v1 uses filename/path conventions only.
- Changing reachability traversal or the graph-based dead-code path's semantics
  beyond applying the same classification.
- A new severity enum on `DeadFile` — the `reason` field is the classification
  signal; "info severity" maps to the suggestion's existing `priority: 'low'`.

## Decisions made

1. **The classification lives in the detector; fixers key off `reason`.** A single
   source of truth: `findDeadFiles` (snapshot path) and `classifyUnreachableNode`
   (graph path) set `reason: 'UNREFERENCED_ENTRY_POINT'` when the path matches an
   entry-point convention. `suggestions.ts` and `safe-fixes.ts` branch on that
   `reason` — they do not re-implement path matching.

2. **Entry-point conventions (v1).** A file matches when its basename/path matches:
   - config files: basename matching `/\.config\.(m|c)?[jt]s$/` (vite/vitest/tsup/
     rollup/etc. `*.config.ts|mts|cts|js|mjs|cjs`);
   - framework module roots: basename in `{ main.ts, main.tsx, main.mts,
app.module.ts }` (Vue/Angular/React `src/main.*`, NestJS `app.module.ts`).
     The set is a documented constant, easy to extend.

3. **New non-delete suggestion type `configure-entrypoint`.** Added to the
   `Suggestion['type']` union. The suggestion has `priority: 'low'` (info),
   `title: "Unreferenced entry point: <file>"`, and steps that tell the user to add
   the file to `entropy.entryPoints` — never delete steps.

4. **Auto-fix skips entry points.** `createDeadFileFixes` filters out
   `UNREFERENCED_ENTRY_POINT` files so the more dangerous auto-delete path can never
   remove a build entry point.

5. **Seed real entry points.** Add the repo's genuine build entry points
   (dashboard `main.tsx` + `vite.config.ts`, `tsup.config.ts` build configs) to
   `harness.config.json` `entropy.entryPoints`. `resolveEntryPoints` treats
   `entryPoints` as literal paths (no existence gate), so seeding is safe.

## Acceptance criteria

1. A `*.config.ts` file that is unreachable is emitted with
   `reason: 'UNREFERENCED_ENTRY_POINT'` (not `NO_IMPORTERS`).
2. A `src/main.ts` file that is unreachable is emitted with
   `reason: 'UNREFERENCED_ENTRY_POINT'`.
3. The suggestion fixer emits a `configure-entrypoint` (non-`delete`) suggestion for
   an `UNREFERENCED_ENTRY_POINT` file, and never a `delete` suggestion for it.
4. `createDeadFileFixes` emits no `delete-file` fix for an `UNREFERENCED_ENTRY_POINT`
   file.
5. A genuinely orphaned util (`reason: 'NO_IMPORTERS'`) still gets a `delete`
   suggestion and a `delete-file` fix.
6. `@harness-engineering/core` builds, typechecks, and the entropy dead-code +
   fixer test suites pass; lint clean.
