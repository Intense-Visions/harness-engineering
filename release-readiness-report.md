# Release Readiness Report

**Date:** 2026-03-25
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: FAIL** (1 pre-existing test failure in core/blueprint)

| Category                   | Passed           | Warnings | Failures |
| -------------------------- | ---------------- | -------- | -------- |
| Packaging                  | 76/77            | 0        | 1        |
| Documentation              | 6/6              | 0        | 0        |
| Repo Hygiene               | 5/5              | 0        | 0        |
| CI/CD                      | 6/6              | 0        | 0        |
| Maintenance — Doc Drift    | 0 issues (fixed) | —        | —        |
| Maintenance — Dead Code    | unavailable      | —        | —        |
| Maintenance — Architecture | 7 config items   | —        | —        |
| Maintenance — Diagnostics  | 0 issues         | —        | —        |

## Packaging

### All packages (common fields) [pass]

All 7 packages have: name (scoped), version (valid semver), license, exports/main, files, publishConfig, repository, bugs, homepage, description.

### Build [pass after fix]

- [x] types, core, graph, eslint-plugin, linter-gen, orchestrator, cli — all build successfully
- [x] **Fixed:** cli `install.ts:245` TS2379 (`exactOptionalPropertyTypes` violation)

### Typecheck [pass after fix]

- [x] All 7 packages + docs pass typecheck
- [x] **Fixed:** same install.ts:245 error

### Tests [fail — pre-existing]

- [x] types, graph, eslint-plugin, linter-gen, orchestrator, cli — all tests pass
- [ ] **core:** 1 test failure — `test/blueprint/content-pipeline.test.ts` cannot resolve `./content-pipeline` relative import (135/136 tests pass)

### Lint [pass]

- [x] All 7 packages pass lint

## Documentation

- [x] README.md exists
- [x] README has install/quickstart section
- [x] README has usage and API sections
- [x] CHANGELOG.md exists with entries
- [x] LICENSE exists

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env
- [x] No actionable TODO/FIXME in published source (only in bundled skill docs)

## CI/CD

- [x] CI workflow: .github/workflows/ci.yml
- [x] Release workflow: .github/workflows/release.yml
- [x] Harness workflow: .github/workflows/harness.yml
- [x] test, lint, typecheck scripts in root package.json

## Maintenance Results

### Doc Drift

All 13 drift issues fixed this session:

- Replaced deleted `packages/mcp-server` references with orchestrator (README, AGENTS.md)
- Updated MCP tool count 42 → 47
- Updated template count 5 → 6
- Updated 6 API doc version numbers to match package.json
- Added deprecation notices for `validateAgentsMap` and `validateKnowledgeMap`
- Updated ESLint plugin doc: rule count 8 → 10, added 2 missing rule docs, updated config tables
- Standardized MCP config example in docs/api/mcp-server.md

### Dead Code

Unavailable — agent hit usage limit. Run `/harness:cleanup-dead-code` separately.
Previous run (2026-03-24) reported 1,151 items.

### Architecture

7 configuration items (not code violations — the code is correct, the constraint config is stale):

- `core` imports from `graph` but `allowedDependencies` only lists `types` (3 files)
- `cli` imports from `orchestrator` but it's not in `allowedDependencies` (1 file)
- `orchestrator` package missing from `harness.config.json` layers
- 2 `forbiddenImports` rules missing for coverage

**Recommendation:** Update `harness.config.json` to match the actual (correct) dependency structure.

### Diagnostics

Clean. No issues beyond the known (now fixed) install.ts type error.

## Fixes Applied

1. `packages/cli/src/commands/install.ts:245` — fixed `exactOptionalPropertyTypes` violation
2. `README.md` — replaced mcp-server with orchestrator in packages table
3. `README.md` — updated MCP tool count 42 → 47
4. `README.md` — updated component table (packages desc, templates 5 → 6)
5. `AGENTS.md` — removed mcp-server from package list and directory tree
6. `AGENTS.md` — updated template list to include orchestrator
7. `docs/api/cli.md` — version 1.7.0 → 1.11.0
8. `docs/api/core.md` — version 0.8.0 → 0.11.0, VERSION constant, deprecation notices
9. `docs/api/eslint-plugin.md` — version 0.1.2 → 0.2.1, rule count, config tables, 2 rule docs
10. `docs/api/graph.md` — version 0.2.2 → 0.3.2, VERSION constant
11. `docs/api/linter-gen.md` — version 0.1.1 → 0.1.3
12. `docs/api/types.md` — version 0.1.0 → 0.3.0
13. `docs/api/mcp-server.md` — standardized MCP config

## Remaining Items

- [ ] Fix pre-existing test: `packages/core/test/blueprint/content-pipeline.test.ts` — relative import resolution failure
- [ ] Update `harness.config.json` to add orchestrator layer and update core/cli allowedDependencies
- [ ] Run `/harness:cleanup-dead-code` to assess 1,151 dead code items from previous session
