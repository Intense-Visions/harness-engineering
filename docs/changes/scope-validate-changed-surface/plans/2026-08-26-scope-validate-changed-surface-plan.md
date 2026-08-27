# Plan: Scope `harness validate` to the changed surface

**Issue:** #1523 · **Proposal:** `../proposal.md` · **Approach:** TDD, additive, non-breaking.

## Tasks

### T1 — Changed-surface derivation module (test-first)

- `packages/cli/src/commands/validate-scope.ts`:
  - `deriveChangedSurface(cwd, { since?, defaultBranch? })` → merge-base (or `since`)
    diff ∪ untracked, existing files only, POSIX-normalized. Never throws; returns
    `{ ok:false, reason }` on git failure.
  - `filterToDesignSurface(cwd, files)` → keep only design-relevant extensions,
    drop skip-dirs and `analysis.exclude` ∪ `design.exclude` matches (`scoped ⊆ full`).
  - `SCOPED_WALKERS = ['driftDetection','brandCompliance']` (anatomy intentionally excluded).
- Tests: `tests/commands/validate-scope.test.ts` — real temp git repos (branch diff,
  uncommitted edit, untracked, deletion, `--since`, unknown-ref/no-repo fallback) +
  filter parity (extensions, skip-dirs, exclude globs).

### T2 — Wire scope into `runValidate`

- `packages/cli/src/commands/validate.ts`:
  - `ValidateOptions`: `changed?`, `since?`, `defaultBranch?`. `ValidateResult.scope`.
  - Derive surface up front; on success pass `filterToDesignSurface(...)` as `files`
    to detect-drift and audit-brand; on failure fall back to full sweep + record reason.
  - `--changed` / `--affected` / `--since <ref>` / `--default-branch <name>` flags.
  - Text + JSON scope reporting, including the staleness caveat.
- Tests: `tests/commands/validate.changed.test.ts` — full default (no files), affected
  (drift+brand get the filtered surface, anatomy left full), `--since` implies affected,
  git-failure fallback.

### T3 — Telemetry variant

- `packages/cli/src/bin/command-telemetry.ts`: record `variant: 'affected'|'full'` on
  the `cli/validate` adoption record (primary key stays `cli/validate`).
- Tests: extend `tests/bin/command-telemetry.test.ts` (variant present/absent).

### T4 — Call-site rewiring

- `packages/orchestrator/package.json`: `validate` script → `harness validate --changed`.
- Persona CI workflows + pre-commit `ci check` left full (see proposal audit + assumptions).

### T5 — Docs + generated reference + changeset

- `docs/guides/ci-cd-validation.md`: affected-only mode + staleness contract.
- `pnpm run generate-docs` → `docs/reference/cli-commands.md` picks up the new flags.
- `.changeset/scope-validate-changed-surface.md` (cli minor, orchestrator patch).

### T6 — Verify

- Build CLI (Node 22), typecheck, run the new/affected tests, and drive the built
  binary to confirm `scoped ⊆ full` parity and the scope reporting end-to-end.
