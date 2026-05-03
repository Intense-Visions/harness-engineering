# Plan: Docs Auto-Generation Phase 1 — Script Skeleton (Reconciliation)

**Date:** 2026-04-01
**Spec:** docs/changes/docs-auto-generation/proposal.md
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Pre-Planning Finding

Phase 1 scope is **already implemented**. The script exists at `scripts/generate-docs.mjs` with:

- Output directory creation (`docs/reference/`)
- Auto-generated header: `<!-- AUTO-GENERATED — do not edit. Run pnpm run generate-docs to regenerate. -->`
- Three complete generators (CLI, MCP, Skills) -- not just stubs
- `generate-docs` wired in root `package.json` as `node scripts/generate-docs.mjs`
- `--check` flag for CI freshness verification
- `pnpm run generate-docs` runs successfully and produces all three output files

**Spec vs. implementation delta:**

| Spec says                                    | Implementation has                             | Impact                                                                         |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `scripts/generate-docs.ts` with `tsx` runner | `scripts/generate-docs.mjs` with `node` runner | Functionally equivalent. `.mjs` avoids `tsx` dependency. No conversion needed. |
| Stub functions for generators                | Full generator implementations                 | Ahead of schedule -- Phases 2-4 are already done.                              |

This plan validates the existing implementation against Phase 1 acceptance criteria and closes any minor gaps.

## Goal

Verify that the existing `scripts/generate-docs.mjs` satisfies all Phase 1 spec requirements and the script produces correct output.

## Observable Truths (Acceptance Criteria)

1. When `pnpm run generate-docs` is run, the script exits with code 0 and produces files in `docs/reference/`.
2. The file `docs/reference/cli-commands.md` starts with the auto-generated header comment.
3. The file `docs/reference/mcp-tools.md` starts with the auto-generated header comment.
4. The file `docs/reference/skills-catalog.md` starts with the auto-generated header comment.
5. When `pnpm run generate-docs -- --check` is run with fresh docs, the script exits with code 0.
6. `harness validate` passes.

## File Map

- VERIFY `scripts/generate-docs.mjs` (existing -- validate structure)
- VERIFY `package.json` (existing -- validate `generate-docs` script entry)
- VERIFY `docs/reference/cli-commands.md` (existing -- validate header)
- VERIFY `docs/reference/mcp-tools.md` (existing -- validate header)
- VERIFY `docs/reference/skills-catalog.md` (existing -- validate header)

## Tasks

### Task 1: Validate script execution and output

**Depends on:** none
**Files:** (read-only verification)

1. Run: `pnpm run generate-docs`
2. Verify exit code is 0
3. Verify `docs/reference/cli-commands.md` exists and first line is `<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->`
4. Verify `docs/reference/mcp-tools.md` exists and first line matches the same header
5. Verify `docs/reference/skills-catalog.md` exists and first line matches the same header
6. Run: `harness validate`

**Expected outcome:** All verifications pass. No code changes needed.

### Task 2: Validate CI check mode

**Depends on:** Task 1
**Files:** (read-only verification)

1. Run: `pnpm run generate-docs` to ensure docs are fresh
2. Run: `pnpm run generate-docs -- --check`
3. Verify exit code is 0 and output includes "All reference docs are fresh"
4. Run: `harness validate`

**Expected outcome:** Check mode works correctly for CI freshness verification.

### Task 3: Validate package.json wiring

**Depends on:** none
**Files:** `package.json` (read-only verification)

1. Verify `package.json` has `"generate-docs": "node scripts/generate-docs.mjs"` in scripts
2. Verify the script is callable via `pnpm run generate-docs`
3. Run: `harness validate`

**Expected outcome:** Script is properly wired. No changes needed.

## Traceability

| Observable Truth                                    | Delivered by  |
| --------------------------------------------------- | ------------- |
| 1. `pnpm run generate-docs` exits 0, produces files | Task 1        |
| 2. cli-commands.md has header                       | Task 1        |
| 3. mcp-tools.md has header                          | Task 1        |
| 4. skills-catalog.md has header                     | Task 1        |
| 5. `--check` mode works                             | Task 2        |
| 6. `harness validate` passes                        | Tasks 1, 2, 3 |

## Notes

- The spec calls for `scripts/generate-docs.ts` with `tsx` runner, but the existing `.mjs` implementation is functionally superior: it has zero extra dependencies (no `tsx` needed), runs directly with `node`, and is already battle-tested. Converting to `.ts` would add complexity with no benefit for a build script.
- Phases 2-4 (CLI generator, MCP generator, Skills generator) are already implemented in the existing script. Those phase plans should be reconciliation/validation plans as well.
- Phase 5 (CI integration) is partially implemented via the `--check` flag but may still need the `.github/workflows/ci.yml` entry.
