# Plan: Protected Code Regions — Phases 2-4

**Date:** 2026-04-17 | **Spec:** docs/changes/protected-code-regions/proposal.md | **Tasks:** 5 | **Time:** ~20 min

## Goal

Wire the existing `harness-ignore` annotation parser into entropy detectors and cleanup classifiers so protected regions are skipped at detection time, and add a CLI `audit-protected` command for visibility.

## Observable Truths (Acceptance Criteria)

1. When `detectDeadCode()` is called with a `ProtectedRegionMap`, dead exports on protected lines shall not appear in the report.
2. When `detectDeadCode()` is called with a `ProtectedRegionMap`, dead files with any protected region shall not appear in the report.
3. When `detectDeadCode()` is called with a `ProtectedRegionMap`, unused imports on protected lines shall not appear in the report.
4. When `detectDeadCode()` is called with a `ProtectedRegionMap`, dead internals on protected lines shall not appear in the report.
5. When `detectDeadCode()` is called without `ProtectedRegionMap`, behavior shall be unchanged (backward compatible).
6. The `SafetyLevel` type shall include `'protected'` as a valid value.
7. When a `CleanupFinding` falls within a protected region, `markProtectedFindings()` shall set `safety: 'protected'`.
8. `harness audit-protected` shall list all protected regions with file, lines, scopes, reasons.
9. `harness audit-protected` shall report annotation validation issues.
10. `harness audit-protected --json` shall output structured JSON.
11. All existing tests shall continue to pass.

## File Map

```
MODIFY packages/core/src/entropy/detectors/dead-code.ts
MODIFY packages/core/tests/entropy/detectors/dead-code.test.ts
MODIFY packages/core/src/entropy/types/fix.ts
MODIFY packages/core/src/entropy/fixers/cleanup-finding.ts
MODIFY packages/core/src/entropy/index.ts
MODIFY packages/core/tests/entropy/fixers/cleanup-finding.test.ts
CREATE packages/cli/src/commands/audit-protected.ts
CREATE packages/cli/tests/commands/audit-protected.test.ts
MODIFY packages/cli/src/commands/_registry.ts (auto-generated)
```

## Tasks

### Task 1: Add protected region filtering to detectDeadCode

**Depends on:** none | **Files:** packages/core/src/entropy/detectors/dead-code.ts, packages/core/tests/entropy/detectors/dead-code.test.ts

1. Add `filterProtectedFindings()` function to `dead-code.ts` that filters `DeadCodeReport` using `ProtectedRegionMap`
2. Add optional `protectedRegions?: ProtectedRegionMap` parameter to `detectDeadCode()`
3. Apply filter before returning the report
4. Write tests: protected exports skipped, protected files skipped, protected imports skipped, backward-compat without regions
5. Run: `pnpm --filter @harness-engineering/core test -- --run packages/core/tests/entropy/detectors/dead-code.test.ts`

### Task 2: Add 'protected' safety level and markProtectedFindings

**Depends on:** none (parallel with Task 1) | **Files:** packages/core/src/entropy/types/fix.ts, packages/core/src/entropy/fixers/cleanup-finding.ts, packages/core/src/entropy/index.ts, packages/core/tests/entropy/fixers/cleanup-finding.test.ts

1. Add `'protected'` to `SafetyLevel` union in `fix.ts`
2. Add `markProtectedFindings(findings, regions)` function in `cleanup-finding.ts`
3. Export from `entropy/index.ts`
4. Write tests: finding in protected region gets `safety: 'protected'`, finding outside stays unchanged, finding with no regions stays unchanged
5. Run: `pnpm --filter @harness-engineering/core test -- --run packages/core/tests/entropy/fixers/cleanup-finding.test.ts`

### Task 3: Create audit-protected CLI command

**Depends on:** none (parallel with Tasks 1-2) | **Files:** packages/cli/src/commands/audit-protected.ts, packages/cli/tests/commands/audit-protected.test.ts

1. Create `audit-protected.ts` following the `cleanup.ts` command pattern
2. Implement `runAuditProtected()` — glob source files, read+parse, aggregate regions and issues
3. Implement `createAuditProtectedCommand()` — commander setup with `--json` support
4. Create test file with mocked file system
5. Run: `pnpm --filter @harness-engineering/cli test -- --run packages/cli/tests/commands/audit-protected.test.ts`

### Task 4: Register CLI command via barrel export generation

**Depends on:** Task 3 | **Files:** packages/cli/src/commands/\_registry.ts (auto-generated)

1. Run `pnpm run generate-barrel-exports` to auto-register the new command
2. Verify `_registry.ts` includes `createAuditProtectedCommand`
3. Run: `pnpm --filter @harness-engineering/cli test -- --run`

### Task 5: Full validation

**Depends on:** Tasks 1-4 | **Files:** none (validation only)

1. Run full test suite: `pnpm test`
2. Run: `harness validate`
3. Verify all observable truths are met
