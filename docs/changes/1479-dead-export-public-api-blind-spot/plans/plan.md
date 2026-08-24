# Plan — Dead-export detector blind spot for exported-but-unused public API (#1479)

Trace of the brainstorming -> autopilot (plan -> execute -> verify -> review) run for GitHub issue #1479,
executed autonomously in a roadmap-fleet build lane.

## Problem (brainstorming)

The dead-export detector does not flag a symbol exported from a package's public surface
(barrel / `.d.ts`) that has **zero non-test callers**, because usage attribution credits the
barrel re-export rather than following it to the defining symbol. The most consequential dead
code — logic in a package's advertised surface — is precisely what the detector misses, silently.

### Grounding (verified, not trusted)

- Detector lives in `packages/core/src/entropy/detectors/dead-code.ts` (snapshot path,
  AST-accurate) and the graph path in `packages/graph/src/entropy/GraphEntropyAdapter.ts`
  (coarse, file-level, regex-ingested). Production `detect_entropy` uses the graph path
  (`packages/cli/src/mcp/tools/entropy.ts` builds `graphDeadCodeData`).
- Empirically probed (scratch harness): in the snapshot path a barrel re-export is **not**
  counted as an importer, so usage attribution never follows `export { X } from './origin'`
  to `origin:X`. A consumer importing `X` **via the barrel** credits the barrel's re-export
  entry (`barrel:X`), never `origin:X` — so a genuinely-used public export can look unused and,
  conversely, all barrel-only exports collapse into `NO_IMPORTERS` ("delete me"), which is wrong
  for public API (removal is a breaking change).
- `3af288089` / PR #1409 made the detector count **test-file** import edges to kill 266 false
  positives. This change is the opposite gap (a false negative) and preserves #1409: an export
  imported by any test stays live; `PUBLIC_API_UNUSED` requires zero importers of any kind after
  re-export following.
- `contextBudget()` (the issue's evidence case) was already wired by #1274; the **detector gap**
  it exposed is what this fixes.

## Assumption taken (recommended default for the core ambiguity)

A public-API export legitimately has zero _internal_ callers by design, so not every barrel
export may be flagged. Scope adopted:

> Flag an export that is **re-exported through the package barrel / public surface** but has
> **zero real (non-test) importers across the workspace after re-export following** as a distinct,
> lower-severity, **advisory** finding class `PUBLIC_API_UNUSED` — recommendation is _wire or
> deprecate_, not _remove_. Treat a barrel re-export as NOT-a-use; count real call/import sites in
> non-test code, following re-export chains so a real consumer importing via the barrel keeps the
> origin live. Provide an explicit opt-out (a `@public` / `@publicApi` annotation on the export, or
> a `publicApiAllowlist` in the dead-code config) so intentionally-public-for-adopters API is exempt.

Conservative sub-decisions (documented limitations, advisory v1):

- A test-only-imported public export is treated as **live** (preserves #1409 exactly); it is not
  flagged even though it has zero non-test callers.
- Renamed (`export { a as b } from './x'`) and star (`export * from './x'`) re-exports are not
  followed to the origin symbol (parser drops the local name / names nothing); such symbols are
  simply not classified as public surface. No false positives result.

## Design

1. **Re-export-aware usage attribution** (`buildExportUsageMap` / `recordImportEdge`): when an
   import resolves to a file whose matching export is itself a re-export, follow the chain
   (cycle-guarded) to the defining file and credit the **origin** export as used.
2. **Public-surface set** (`buildPublicSurface`): every `(definingFile, name)` reachable by
   following a barrel `isReExport` export is "public API".
3. **New advisory class** `PUBLIC_API_UNUSED` on `DeadExport.reason`: a public-surface export with
   zero real importers and not test-imported, and not opted-out. Non-public dead exports remain
   `NO_IMPORTERS`.
4. **Opt-out**: `@public`/`@publicApi` JSDoc annotation adjacent to the export, or
   `DeadCodeConfig.publicApiAllowlist` (matches `file:name`, bare `name`, or a file-path substring).
5. **Production reach**: `detectDeadCode` merges snapshot-derived `PUBLIC_API_UNUSED` findings into
   the graph-path report too (guarded for empty snapshots), so `detect_entropy` surfaces them.
6. **Safe by default**: auto-fixers (`safe-fixes.ts`) only act on `NO_IMPORTERS`; the suggestion for
   `PUBLIC_API_UNUSED` is "wire or deprecate", never delete.

## Tasks (execution — TDD)

- [x] Add `PUBLIC_API_UNUSED` to `DeadExport.reason` (`types/dead-code.ts`).
- [x] Add `publicApiAllowlist?: string[]` to `DeadCodeConfig` (`types/config.ts`).
- [x] Re-export following + public-surface + classification + opt-out (`detectors/dead-code.ts`).
- [x] Graph-path merge in `detectDeadCode`.
- [x] "Wire or deprecate" advisory suggestion for the new class (`fixers/suggestions.ts`).
- [x] Fixture `dead-code-public-api/` + focused behavior test proving: uninvoked barrel export is
      flagged `PUBLIC_API_UNUSED`; a consumer importing it via the barrel clears the flag
      (re-export following); `@public` opt-out suppresses it; non-public dead export stays
      `NO_IMPORTERS`; #1409 test-import behavior unchanged.

## Verify / Review

- Focused test green; full `entropy` detector + fixer suites green; typecheck + build green.
- No auto-delete path for the advisory class; #1409 regression test still passes.
