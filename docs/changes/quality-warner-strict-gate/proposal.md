---
title: Rename quality-gate hook to quality-warner and ship a blocking strict-quality-gate variant
status: draft
created: 2026-06-25
feature: quality-warner-strict-gate
roadmap_row: Rename quality-gate hook and ship a strict variant that blocks
external_id: github:Intense-Visions/harness-engineering#526
priority: P0
milestone: v5.0 — Enforcement Hardening
keywords:
  [
    hooks,
    quality-gate,
    quality-warner,
    strict-quality-gate,
    hook-profiles,
    enforcement,
    post-tooluse,
    exit-code,
    format-check,
    installer,
  ]
---

# Rename quality-gate hook to quality-warner and ship a blocking strict-quality-gate variant

## Overview & Goals

### Problem

`packages/cli/src/hooks/quality-gate.js` ships in the **default `standard` profile**
(`packages/cli/src/hooks/profiles.ts:26`) but is documented (`quality-gate.js:4`) and
implemented to **"Never block (always exits 0)"** — every code path, including
unexpected errors (`quality-gate.js:125-127`), ends in `process.exit(0)`. It runs the
project formatter/linter (`biome check` / `prettier --check` / `ruff check` / `gofmt -l`)
and writes results to **stderr** only.

A hook named `quality-gate` that gates nothing is _"convention without enforcement"_ —
the precise failure mode `STRATEGY.md#our-approach` indicts ("agents drift back to bad
patterns the moment a session forgets the prompt"). It also undercuts the **Harness
Coverage** KPI (`STRATEGY.md#key-metrics`: ratio of documented rules carrying mechanical
enforcement). Strict-profile adopters who want real blocking have no option today.

### Goals

1. Rename the non-blocking hook to **`quality-warner`** so the name matches behavior
   (warns, never blocks).
2. Add **`strict-quality-gate`** (strict profile only) that **exits 2** on genuine
   format/lint violations, surfacing the failure to Claude as a must-fix.
3. Single-source the shared detection logic so warn and strict behavior cannot drift.
4. Zero silent breakage for existing adopters (installer self-heals; `CHANGELOG`
   documents re-running `harness hooks init`).

### Non-goals (YAGNI)

Auto-fixing files; new detectors beyond Biome/Prettier/Ruff/gofmt; configurable per-rule
strictness; a back-compat alias shim; modifying any other hook.

## Decisions made

| Decision              | Choice                                                                         | Rationale                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warn-tier name        | `quality-warner` (standard profile)                                            | Keeps the "quality" domain word (the hook does lint+format, not just format) while making the non-blocking contract explicit; pairs as the warn sibling of `strict-quality-gate`. (Q1)                                          |
| Code structure        | Shared core module + two thin entrypoints                                      | Single source of truth for detection; preserves the one-hook-one-file contract `profiles.ts` / `hooks.json` / the installer depend on. (Q2 + Q5)                                                                                |
| Shared-logic shipping | Installer copies a shared **support file** (`format-check.js`)                 | True structural single-source: both entrypoints `import './format-check.js'`; both land in `.harness/hooks/`, so the relative import resolves at the adopter. (Q5)                                                              |
| Strict failure mode   | Exit 2 on real violations; **fail open** (loud stderr, exit 0) on infra errors | Makes the gate real for what it exists to catch without a missing formatter walling off every edit. (Q3)                                                                                                                        |
| Migration             | Clean rename + `CHANGELOG` note, **no shim**                                   | The installer wholesale-replaces the `hooks` key (`init.ts:71`) and wipes stale scripts (`init.ts:99-104`), so a rename self-heals on re-init / plugin update. A shim would keep alive the dishonest name we are retiring. (Q4) |

## Technical Design

Hooks are ESM `.js` files copied **raw** (not bundled) into the adopter's
`.harness/hooks/` directory, so each must be self-contained apart from the one
intended sibling import.

### New / changed files

- **`packages/cli/src/hooks/format-check.js`** _(new — shared core)_. Exports
  `runFormatCheck(input, cwd)`. Holds the `DETECTORS` table, `detectFormatter`, the
  `.go`/gofmt special-case, and stdin handling. Returns a structured result and takes
  **no opinion on exit codes**:

  ```js
  // { status: 'clean' | 'violations' | 'infra-error', name, output, message }
  export function runFormatCheck(input, cwd) {
    /* detection only */
  }
  ```

  **Disambiguation contract (load-bearing).** Today's `quality-gate.js:116` lumps
  "formatter reported violations" and "formatter failed to run" into one `catch`.
  `format-check.js` must separate them so `strict-quality-gate` blocks only on real
  violations: classify as `infra-error` when the tool is absent/non-spawnable
  (`ENOENT`), times out, or its output is unparseable; classify as `violations` only when
  the detector spawned and exited non-zero with parseable violation output. When the two
  cannot be told apart from the detector's exit code alone, **default to `infra-error`**
  (fail open) — consistent with the Q3 decision. This deliberately means a formatter that
  crashes mid-check while a real violation exists passes (exit 0); that is an accepted
  fail-open tradeoff, documented in the strict-profile contract.

- **`packages/cli/src/hooks/quality-warner.js`** _(new entrypoint — replaces
  `quality-gate.js`)_. `import { runFormatCheck } from './format-check.js'`, read stdin,
  map the result to stderr text, **always `process.exit(0)`**. Behaviorally identical to
  today's hook.

- **`packages/cli/src/hooks/strict-quality-gate.js`** _(new entrypoint)_. Same import.
  On `violations` → write a must-fix message to stderr + **`process.exit(2)`**. On
  `infra-error` → write a loud warning + `process.exit(0)`. On `clean` → `process.exit(0)`.

- **`packages/cli/src/hooks/quality-gate.js`** _(deleted)_.

### Exit-code semantics

A PostToolUse hook that **exits 2** feeds its stderr back to Claude as a blocking
must-fix (the edit already landed; the model is told to correct it). That is the
enforcement mechanism available to a Post hook — hence `strict-quality-gate` uses it.

### Shipping path (verified)

- `packages/cli/scripts/copy-assets.mjs:14` recursively copies `src/hooks/ → dist/hooks/`
  (excluding `.ts`), so `format-check.js` reaches `dist/hooks/` with **no build change**.
- `packages/cli/src/commands/hooks/init.ts` then copies hooks from `dist/hooks/` to the
  adopter's `.harness/hooks/`. It currently copies only `HOOK_SCRIPTS`-named files
  (`init.ts:112-118`) and wipes every other `.js` first (`init.ts:99-104`). It must be
  taught to **also copy `format-check.js`** (whenever a format hook is active) and to
  **exempt it from the stale-`.js` wipe**.

## Integration Points

### Entry Points

Two new PostToolUse:Edit|Write hooks — `quality-warner` (standard) and
`strict-quality-gate` (strict). `quality-gate` is removed.

### Registrations Required

- `packages/cli/src/hooks/profiles.ts:23-33` `HOOK_SCRIPTS` — replace the `quality-gate`
  row with `quality-warner` (`minProfile: 'standard'`); add `strict-quality-gate`
  (`minProfile: 'strict'`). Update the profile doc comment (`profiles.ts:5-8`).
- `scripts/lib/plugin-config.mjs:93-100` `STANDARD_HOOKS` — hand-maintained duplicate of
  the standard-profile hooks; swap `quality-gate` → `quality-warner`. (`strict-quality-gate`
  is **not** added here — `hooks.json` lists standard-and-below only; the strict hooks
  `sentinel-pre/post` are likewise absent.)
- `packages/cli/src/commands/hooks/init.ts` — copy `format-check.js` as a support file and
  exempt it from the stale-`.js` wipe.
- **Generated plugin hooks (both targets).** `STANDARD_HOOKS` drives **two** generated
  files, each with a CI drift gate (`generate:plugin:check`):
  - `.claude-plugin/hooks.json:29` — regenerate via `generate:plugin:claude` (swap the
    `quality-gate.js` command path → `quality-warner.js`).
  - `.cursor-plugin/hooks.json:29` — regenerate via `generate:plugin:cursor`.
  - Run `generate:plugin:all` so both targets stay in lockstep; `generate:plugin:check`
    will fail CI on drift if either is missed. No strict entry is added to either (both
    list standard-and-below only).
- **Repo-local dotfiles that do NOT self-heal** (dogfooding installs in this repo; not
  adopter-facing):
  - `.claude/settings.json:29` — fix by re-running `harness hooks init` in this repo.
  - `.codex/hooks.json:29` — hand-maintained, **no regeneration path** (codex has
    `generateHooks: false` in `plugin-config.mjs`); requires a manual edit
    `quality-gate.js` → `quality-warner.js`.
- `packages/cli/src/templates/post-write.ts:57` — update the comment that names
  `quality-gate` (a gitignore-doc comment inside `ensureHarnessGitignore`; non-load-bearing).

### Documentation Updates

`docs/guides/hooks-system.md`, `docs/knowledge/cli/hook-profiles.md`,
`docs/reference/source-map.md`, `docs/reference/cli.md`, `docs/reference/api/cli.md`,
`packages/cli/CHANGELOG.md` (rename + "re-run `harness hooks init`").

### Architectural Decisions

One ADR-worthy item: the **"installer ships hook support files"** decision changes the
installer's copy contract (previously one file per named hook; now named hooks **plus**
shared support modules, with a wipe exemption). Future hook authors need to know shared
modules are a supported, shippable pattern. References the Q5 decision in **Decisions
made** — not restated here.

### Knowledge Impact

The `hook-profiles` knowledge entry gains: the warn-tier vs gate-tier distinction; the
support-file shipping mechanism; and the strict-gate **fail-open-on-infra** contract.

## Success Criteria

1. `quality-gate.js` is gone; `quality-warner.js` exists and warns-only / exits 0
   (parity with prior behavior).
2. `strict-quality-gate.js`, given a file with real format/lint violations, writes them to
   stderr and **exits 2**.
3. `strict-quality-gate.js`, given an infra error (no formatter installed / timeout /
   unparseable output), writes a loud warning and **exits 0** (fails open).
4. `PROFILES.standard` includes `quality-warner` (not `quality-gate`); `PROFILES.strict`
   includes `strict-quality-gate`.
5. Both entrypoints obtain detection from `format-check.js` — no duplicated detector table.
6. `harness hooks init --profile standard` copies `quality-warner.js` + `format-check.js`;
   `--profile strict` additionally copies `strict-quality-gate.js`; a pre-existing
   `quality-gate.js` in the dest is removed; `format-check.js` survives the stale-wipe.
7. `.claude-plugin/hooks.json` + snapshot tests regenerated and green;
   `harness validate` passes.
8. `packages/cli/CHANGELOG.md` documents the rename and the re-init step.

## Implementation Order

1. **Extract core:** add `format-check.js` (`runFormatCheck`, no exit opinion).
2. **Entrypoints:** add `quality-warner.js` + `strict-quality-gate.js`; delete
   `quality-gate.js`.
3. **Profiles:** update `HOOK_SCRIPTS` + the standard-hooks duplicate in
   `plugin-config.mjs` + the profile doc comment.
4. **Installer:** `init.ts` copies + preserves `format-check.js`.
5. **Regenerate artifacts:** both plugin `hooks.json` files (`generate:plugin:all`,
   verified by `generate:plugin:check`), snapshots, `post-write.ts` comment; then the
   repo-local dotfiles — re-run `harness hooks init` for `.claude/settings.json` and
   manually edit `.codex/hooks.json`.
6. **Tests:** rename/extend hook tests; add strict violation + infra-fail-open cases; an
   integration test that runs the **copied** hooks from a temp `.harness/hooks/` dir to
   prove the relative import resolves.
7. **Docs + CHANGELOG.**

## Risks

- **[IMPORTANT] New runtime dependency.** No existing hook imports a sibling module, so
  `import './format-check.js'` resolving in the adopter's execution context is unproven
  (the CLI is `"type": "module"`, but the adopter's `.harness/hooks/` dir inherits ESM-ness
  from the nearest `package.json`). The current `quality-gate.js` already uses top-level
  `import` (`quality-gate.js:7-10`) and runs for adopters, so the ESM execution context is
  already satisfied; the residual risk narrows to relative _sibling resolution_
  specifically — which Node resolves natively in ESM, so it is low but unproven on this
  path. Mitigated by the Phase 6 integration test executing copied hooks from a temp
  dir. If sibling resolution fails in some adopter context, fall back to two standalone
  files + a parity-guard test (Q5 option B).
- **Two sources of standard-hook truth.** `profiles.ts` and `plugin-config.mjs` both list
  the standard hooks; the rename must update both or `hooks.json` regeneration drifts.
  Covered by Success Criterion 7 (snapshot test) and the integration test.
