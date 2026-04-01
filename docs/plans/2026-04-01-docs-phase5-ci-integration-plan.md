# Plan: Docs Auto-Generation Phase 5 -- CI Integration (Reconciliation)

**Date:** 2026-04-01
**Spec:** docs/changes/docs-auto-generation/proposal.md
**Estimated tasks:** 1
**Estimated time:** 3 minutes
**Status:** RECONCILIATION -- all spec requirements already implemented

## Goal

CI rejects PRs when generated reference docs (`cli-commands.md`, `mcp-tools.md`, `skills-catalog.md`) are stale.

## Observable Truths (Acceptance Criteria)

1. **[Event-driven]** When a PR is opened against `main` and generated docs are stale, the CI workflow fails with a non-zero exit code.
2. **[Event-driven]** When `pnpm run generate-docs --check` is run and docs match source, it exits 0.
3. **[Event-driven]** When `pnpm run generate-docs --check` is run and docs are stale, it exits non-zero with a message instructing the contributor to regenerate.
4. **[Ubiquitous]** The freshness check runs only on `ubuntu-latest` (not duplicated across the OS matrix).

## Reconciliation Analysis

All four observable truths are **already satisfied** by the current codebase:

| Observable Truth               | Evidence                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. CI fails on stale docs      | `.github/workflows/ci.yml` lines 49-51: `pnpm run generate-docs --check` step runs on PRs to `main`                                            |
| 2. Clean exit on fresh docs    | `--check` mode in `scripts/generate-docs.mjs` regenerates and runs `git diff --exit-code docs/reference/`                                      |
| 3. Non-zero exit on stale docs | Verified locally: `pnpm run generate-docs -- --check` exits 1 with message "Reference docs are stale. Run `pnpm run generate-docs` to update." |
| 4. ubuntu-only                 | CI step has `if: matrix.os == 'ubuntu-latest'` condition                                                                                       |

### Spec vs Implementation Delta

The spec prescribed:

```yaml
run: pnpm run generate-docs && git diff --exit-code docs/reference/
```

The actual implementation uses:

```yaml
run: pnpm run generate-docs --check
```

This is functionally equivalent and superior -- the `--check` flag encapsulates the diff logic inside the script, providing a clearer error message. No change needed.

## File Map

No files need to be created or modified. All artifacts are in place:

- EXISTS `.github/workflows/ci.yml` (lines 49-51: freshness check step)
- EXISTS `scripts/generate-docs.mjs` (supports `--check` flag)
- EXISTS `docs/reference/cli-commands.md`
- EXISTS `docs/reference/mcp-tools.md`
- EXISTS `docs/reference/skills-catalog.md`

## Tasks

### Task 1: Verify CI freshness check end-to-end

**Depends on:** none
**Files:** none (verification only)

This is a verification-only task. No code changes are required.

1. Run `pnpm run generate-docs` to regenerate all docs from current source
2. Run `pnpm run generate-docs --check` and confirm exit code 0 (docs are fresh)
3. Verify `.github/workflows/ci.yml` contains the freshness step:
   - Step name: "Verify generated docs are fresh"
   - Condition: `if: matrix.os == 'ubuntu-latest'`
   - Command: `pnpm run generate-docs --check`
4. Run `harness validate`
5. If docs were stale (step 1 produced changes), commit: `docs: regenerate reference docs`

[checkpoint:human-verify] -- Confirm CI integration is complete with no gaps.

## Spec Success Criteria Traceability

| Spec Criterion                                            | Status    | Task                                                 |
| --------------------------------------------------------- | --------- | ---------------------------------------------------- |
| 6. New CLI command without regeneration causes CI failure | SATISFIED | Verified by `--check` mode diffing `docs/reference/` |
| 7. New skill without regeneration causes CI failure       | SATISFIED | Same mechanism                                       |
| CI enforcement via `pnpm run generate-docs` + diff        | SATISFIED | Encapsulated in `--check` flag                       |
