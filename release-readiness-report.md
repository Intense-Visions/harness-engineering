# Release Readiness Report

**Date:** 2026-03-20
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: FAIL**

| Category                   | Passed     | Warnings | Failures |
| -------------------------- | ---------- | -------- | -------- |
| Packaging                  | 76/77      | 0        | 1        |
| Documentation              | 6/6        | 0        | 0        |
| Repo Hygiene               | 5/5        | 0        | 0        |
| CI/CD                      | 6/6        | 0        | 0        |
| Maintenance — Doc Drift    | 0 issues   | —        | —        |
| Maintenance — Dead Code    | 11 issues  | —        | —        |
| Maintenance — Architecture | 5 findings | —        | —        |
| Maintenance — Diagnostics  | 4 findings | —        | —        |

## Packaging

### All 7 packages (@harness-engineering/{types,graph,core,cli,eslint-plugin,linter-gen,mcp-server})

- [x] name — all scoped `@harness-engineering/*`
- [x] version — all valid semver
- [x] license — all MIT
- [x] exports/main — all defined
- [x] files — all defined
- [x] publishConfig — all `access: "public"`
- [x] repository — all present with directory field
- [x] bugs — all present
- [x] homepage — all present
- [x] description — all present
- [x] Build succeeds — 8/8 turbo tasks pass
- [x] Typecheck passes — 12/12 turbo tasks pass
- [x] Tests pass — 16/16 turbo tasks pass
- [ ] **Lint fails** — ESLint 10 `util.styleText` requires Node >=22, running v21.6.1
- [x] Pack produces expected files (verified core — clean, no src/test leakage)

## Documentation

- [x] README.md exists
- [x] README has install/quickstart section (line 32)
- [x] README has usage section (line 85)
- [x] CHANGELOG.md exists
- [x] CHANGELOG has entries (initial public release)
- [x] LICENSE file exists

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env
- [x] No TODO/FIXME in published source (0 found)

## CI/CD

- [x] CI workflow: `.github/workflows/ci.yml`
- [x] Release workflow: `.github/workflows/release.yml`
- [x] `test` script in root package.json
- [x] `lint` script in root package.json
- [x] `typecheck` script in root package.json
- [x] `harness validate` passes

## Maintenance Results

### Doc Drift

All numeric claims (skill counts, persona counts, ESLint rules, MCP tools, packages) are **accurate and in sync** across AGENTS.md, README.md, and docs/api/index.md. Zero active drift on counts.

Fixes applied this session:

- Added `docs/changes/` to AGENTS.md repo structure tree
- Updated deprecated `validateAgentsMap` example in docs/api/index.md to use `Assembler.checkCoverage()`

### Dead Code

11 findings (not fixed this session — deferred):

- 7 orphaned barrel files (eslint-plugin configs/_, utils/index; core entropy/_/index)
- 4 unused exports (`checkConfigPattern`, `STANDARD_COGNITIVE_MODES`, `SkillError`, `ForbiddenImport`)

### Architecture

5 findings:

- **CRITICAL:** `mcp-server` → `cli` runtime dependency — two application-layer packages should not depend on each other. `generateSlashCommands` should be extracted to `core`.
- **WARNING (fixed):** `cli` declared `core`, `graph`, `linter-gen` as devDependencies but imported at runtime. Moved to `dependencies` this session.
- **LOW:** `cli` → `types` in devDependencies (type-only imports — acceptable)
- **NOTE:** Dead code agent incorrectly flagged `mcp-server` → `linter-gen` as phantom — it is used in `src/tools/linter.ts`. Reverted removal.

### Diagnostics

- **ERROR:** Node v21.6.1 vs engines `>=22.0.0` — blocks lint, should upgrade
- **WARNING:** 6 deprecated API call sites (`validateAgentsMap`/`validateKnowledgeMap`) across cli, core, mcp-server
- **OK:** `@types/node`, `vitest`, `minimatch` all version-aligned across packages
- **ERROR:** `harness check-perf` cannot resolve entry points at monorepo root

## Fixes Applied This Session

1. Moved `@harness-engineering/core`, `graph`, `linter-gen` from devDependencies to dependencies in `packages/cli/package.json`
2. Added `docs/changes/` to AGENTS.md repository structure tree
3. Updated deprecated `validateAgentsMap` example in `docs/api/index.md` to use `Assembler.checkCoverage()`

## Remaining Items

### Blocking (must fix before release)

- [ ] Upgrade Node.js to >=22.0.0 (`nvm install 22 && nvm use 22`) — unblocks lint
- [ ] Lint failure resolves automatically once Node is upgraded

### Non-blocking (should fix before release)

- [ ] Extract `generateSlashCommands` from cli to core/shared — removes mcp-server → cli architectural violation
- [ ] Migrate 6 deprecated `validateAgentsMap()`/`validateKnowledgeMap()` call sites to `Assembler.checkCoverage()`
- [ ] Delete 7 orphaned barrel files
- [ ] Remove 4 unused exports (`checkConfigPattern`, `STANDARD_COGNITIVE_MODES`, `SkillError`, `ForbiddenImport`)
- [ ] Fix `harness check-perf` to support monorepo root (workspace-aware entry point resolution)

## Delta from Previous Run (2026-03-20T12:00:00Z)

| Item                      | Previous                         | Current                   |
| ------------------------- | -------------------------------- | ------------------------- |
| Build                     | FAIL (cyclic dep)                | PASS                      |
| TODO/FIXME count          | 170                              | 0                         |
| README usage section      | missing (warn)                   | present                   |
| Dependency version splits | 3 splits                         | 0 splits (all aligned)    |
| cli dep declarations      | core/graph/linter-gen in devDeps | **Fixed** — moved to deps |
| Doc drift (counts)        | 5 stale counts                   | 0 (all accurate)          |
| Lint                      | not tested (build failed)        | FAIL (Node version)       |
