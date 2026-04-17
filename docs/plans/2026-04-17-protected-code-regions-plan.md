# Plan: Protected Code Regions

**Date:** 2026-04-17 | **Spec:** docs/changes/protected-code-regions/proposal.md | **Tasks:** 7 | **Time:** ~30 min

## Goal

All code-modifying harness subsystems (entropy cleanup, architecture enforcement) respect `harness-ignore` block-level and line-level annotations, skipping protected regions during detection and fix application.

## Observable Truths (Acceptance Criteria)

1. When a file contains `// harness-ignore-start` and `// harness-ignore-end`, `parseProtectedRegions()` returns a `ProtectedRegion` with correct start/end lines, scopes, and reason.
2. When `// harness-ignore entropy: reason` precedes a code line, the parser returns a single-line `ProtectedRegion` covering that code line.
3. `isProtected(file, line, 'entropy')` returns `true` for lines inside a protected block.
4. Unclosed `harness-ignore-start` blocks produce an `unclosed-block` validation issue.
5. Orphaned `harness-ignore-end` markers produce an `orphaned-end` validation issue.
6. `applyFixes()` skips fixes targeting lines within protected regions, adding them to `skipped[]`.
7. `npx vitest run packages/core/tests/annotations/` passes with all tests green.
8. Existing `harness-ignore SEC-XXX-NNN` security scanner behavior is unaffected.
9. Types and parser are exported from `packages/core/src/index.ts`.

## File Map

```
CREATE packages/core/src/annotations/types.ts
CREATE packages/core/src/annotations/protected-regions.ts
CREATE packages/core/src/annotations/index.ts
CREATE packages/core/tests/annotations/protected-regions.test.ts
MODIFY packages/core/src/entropy/fixers/safe-fixes.ts
MODIFY packages/core/src/entropy/index.ts
MODIFY packages/core/src/index.ts
```

## Tasks

### Task 1: Create annotation types

**Depends on:** none | **Files:** packages/core/src/annotations/types.ts

1. Create `packages/core/src/annotations/types.ts` with:
   - `ProtectionScope` type: `'entropy' | 'architecture' | 'security' | 'all'`
   - `ProtectedRegion` interface: `file`, `startLine`, `endLine`, `scopes`, `reason`, `type`
   - `ProtectedRegionMap` interface: `regions`, `isProtected()`, `getRegions()`
   - `AnnotationIssue` interface: `file`, `line`, `type`, `message`
2. Commit: `feat(core): add protected region annotation types`

### Task 2: Create protected region parser (TDD)

**Depends on:** Task 1 | **Files:** packages/core/src/annotations/protected-regions.ts, packages/core/tests/annotations/protected-regions.test.ts

1. Create test file `packages/core/tests/annotations/protected-regions.test.ts` with tests:
   - Parses block regions with `harness-ignore-start` / `harness-ignore-end`
   - Parses line-level `harness-ignore` annotations (protects next non-comment line)
   - Parses scope categories (`entropy`, `architecture`, `entropy,architecture`)
   - Defaults to `all` scope when no scope specified
   - Extracts reason text after colon
   - Reports unclosed blocks as validation issues
   - Reports orphaned ends as validation issues
   - Reports unknown scopes as validation issues
   - `isProtected()` returns true for lines in range, false outside
   - `getRegions()` returns only regions for specified file
   - Handles `#` comment prefix (Python/shell style)
   - Handles empty files and files with no annotations
2. Run tests — observe failures: `npx vitest run packages/core/tests/annotations/protected-regions.test.ts`
3. Create `packages/core/src/annotations/protected-regions.ts` with:
   - `parseProtectedRegions(files: Array<{path: string, content: string}>): {regions: ProtectedRegionMap, issues: AnnotationIssue[]}`
   - `parseFileRegions(filePath: string, content: string): {regions: ProtectedRegion[], issues: AnnotationIssue[]}`
   - `createRegionMap(regions: ProtectedRegion[]): ProtectedRegionMap`
   - Regex patterns for line, start, end annotations
   - Block tracking with stack for nested support
   - Line-level: scan forward past comments/blanks to find protected line
4. Run tests — observe pass
5. Commit: `feat(core): implement protected region parser with TDD`

### Task 3: Create annotations module index

**Depends on:** Task 1, Task 2 | **Files:** packages/core/src/annotations/index.ts

1. Create `packages/core/src/annotations/index.ts` re-exporting:
   - All types from `./types`
   - `parseProtectedRegions`, `parseFileRegions`, `createRegionMap` from `./protected-regions`
2. Commit: `feat(core): add annotations module index`

### Task 4: Wire annotations into entropy exports

**Depends on:** Task 3 | **Files:** packages/core/src/entropy/index.ts, packages/core/src/index.ts

1. Add to `packages/core/src/entropy/index.ts`:
   ```typescript
   export { parseProtectedRegions, parseFileRegions, createRegionMap } from '../annotations';
   export type {
     ProtectionScope,
     ProtectedRegion,
     ProtectedRegionMap,
     AnnotationIssue,
   } from '../annotations';
   ```
2. Add to `packages/core/src/index.ts`:
   ```typescript
   export * from './annotations';
   ```
3. Commit: `feat(core): export annotations from entropy and core modules`

### Task 5: Add protection guard to applyFixes (TDD)

**Depends on:** Task 3 | **Files:** packages/core/src/entropy/fixers/safe-fixes.ts, packages/core/tests/entropy/fixers/safe-fixes.test.ts

1. Add test cases to `packages/core/tests/entropy/fixers/safe-fixes.test.ts`:
   - `applyFixes` with `protectedRegions` skips fixes in protected lines
   - `applyFixes` without `protectedRegions` applies all fixes (backward compatible)
   - Protected fix appears in `result.skipped` array
   - Non-protected fixes still apply normally
2. Run tests — observe failures
3. Modify `packages/core/src/entropy/fixers/safe-fixes.ts`:
   - Import `ProtectedRegionMap` from `../annotations`
   - Extend `FixConfig` interface: add optional `protectedRegions?: ProtectedRegionMap`
   - In `applyFixes()`, before applying each fix, check `protectedRegions.isProtected(fix.file, fix.line, 'entropy')`
   - If protected, add to `skipped[]` and continue
   - For `delete-file` action, check if any region exists for the file
4. Run tests — observe pass
5. Commit: `feat(core): add protected region guard to applyFixes`

### Task 6: Add FixConfig type update for protectedRegions

**Depends on:** Task 5 | **Files:** packages/core/src/entropy/types/fix.ts

1. Add import and optional field to `FixConfig` in `packages/core/src/entropy/types/fix.ts`:

   ```typescript
   import type { ProtectedRegionMap } from '../../annotations';

   export interface FixConfig {
     dryRun: boolean;
     fixTypes: FixType[];
     createBackup: boolean;
     backupDir?: string;
     protectedRegions?: ProtectedRegionMap;
   }
   ```

2. Commit: `feat(core): add protectedRegions to FixConfig type`

### Task 7: Final verification

**Depends on:** Task 1-6 | **Files:** none (verification only)

1. Run full test suite: `npx vitest run packages/core/tests/annotations/`
2. Run existing entropy tests: `npx vitest run packages/core/tests/entropy/fixers/`
3. Run existing security tests: `npx vitest run packages/core/tests/security/`
4. Run TypeScript check: `npx tsc --noEmit -p packages/core/tsconfig.json`
5. Verify all pass
6. Commit: no commit needed (verification only)
