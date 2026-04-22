# Release Readiness Report

**Date:** 2026-04-21
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: PASS** (all standard checks pass; maintenance findings are non-blocking warnings)

| Category                   | Passed | Warnings      | Failures |
| -------------------------- | ------ | ------------- | -------- |
| Packaging                  | 72/72  | 0             | 0        |
| Build / Typecheck          | 2/2    | 0             | 0        |
| Tests                      | 1/1    | 1 (env)       | 0        |
| Documentation              | 6/6    | 0             | 0        |
| Repo Hygiene               | 5/5    | 0             | 0        |
| CI/CD                      | 6/6    | 0             | 0        |
| Maintenance — Doc Drift    | —      | 14            | —        |
| Maintenance — Dead Code    | —      | 4 deps        | —        |
| Maintenance — Architecture | —      | 3             | —        |
| Maintenance — Diagnostics  | —      | 1 err, 7 warn | —        |

## Packaging (all 9 packages)

All packages pass: name, version, license, exports/main, files, publishConfig, repository, description.

| Package                            | Version |
| ---------------------------------- | ------- |
| @harness-engineering/cli           | 1.25.6  |
| @harness-engineering/core          | 0.23.0  |
| @harness-engineering/dashboard     | 0.1.8   |
| @harness-engineering/eslint-plugin | 0.2.4   |
| @harness-engineering/graph         | 0.4.3   |
| @harness-engineering/intelligence  | 0.1.1   |
| @harness-engineering/linter-gen    | 0.1.6   |
| @harness-engineering/orchestrator  | 0.2.11  |
| @harness-engineering/types         | 0.10.0  |

## Build / Typecheck / Tests

- [x] `pnpm build` — 10/10 tasks pass
- [x] `pnpm typecheck` — 16/16 tasks pass
- [x] `pnpm test` — 15/20 pass (dashboard fails due to EADDRINUSE on port 3701 — dev server running; not a code issue)

## Documentation

- [x] README.md exists with install and usage sections
- [x] CHANGELOG.md exists with entries
- [x] LICENSE file exists

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env

## CI/CD

- [x] CI workflow: `.github/workflows/ci.yml`
- [x] Release workflow: `.github/workflows/release.yml`
- [x] test, lint, typecheck scripts in root package.json
- [x] `assess_project` passes (healthy: true)

## Maintenance Results

### Doc Drift (14 issues)

**Fixed this session:**

- docs/api/types.md version 0.9.2 → 0.10.0
- docs/api/core.md version 0.21.3 → 0.23.0
- docs/api/cli.md version 1.24.3 → 1.25.6
- docs/api/orchestrator.md version v0.2.6 → 0.2.11
- README.md MCP resource count 8 → 9
- docs/standard/implementation.md Node version 18 → 22 (4 occurrences)
- packages/graph/README.md removed phantom lokijs/hnswlib-node/tree-sitter deps

**Remaining:**

- README.md line 92-93: broken `HarnessConfigSchema` import example
- packages/orchestrator/README.md: nonexistent API in quick start (`loadWorkflowConfig`, `createEmptyState()`)
- packages/eslint-plugin/README.md: 3 rules listed as "Default: warn" but not in configs
- packages/linter-gen/README.md: stale generator version (0.1.0, code is 0.1.4, pkg is 0.1.6)
- Missing: docs/api/ entries for intelligence and dashboard packages
- Missing: packages/dashboard/README.md

### Dead Code (4 dependency issues, 61 dead exports)

**Unused dependencies:**

- `packages/cli/package.json`: @typescript-eslint/typescript-estree, tree-sitter-wasms, web-tree-sitter (redundant — already in core)
- `packages/linter-gen/package.json`: minimatch (only in templates, not source)

**61 truly dead exports** across core (19), orchestrator (22), intelligence (5), linter-gen (6), graph (3), cli schemas (~70 unnecessary export keywords)

### Architecture (3 findings)

- **Medium:** `core` imports from `graph` (2 files) — violates types→core→graph layering
- **Low:** Dashboard `chat.ts ↔ chat-session.ts` circular import via barrel re-export
- **Info:** Dashboard imports `FeatureStatus` from core instead of canonical source (types)

### Diagnostics (1 error, 7 warnings)

- **ERROR:** @anthropic-ai/sdk version mismatch: intelligence ^0.39.0 vs orchestrator ^0.87.0
- **WARN:** ESLint config missing `.tsx` pattern (38 React components not TypeScript-linted)
- **WARN:** 5 packages missing `"type": "module"` field
- **WARN:** No `engines` field in publishable packages
- **WARN:** `import.meta.url` CJS build warning in core
- **WARN:** Dashboard Vite bundle 1.3MB (recommended <500KB)
- **WARN:** eslint-plugin tsconfig extends root instead of base
- **WARN:** Dashboard missing `test:coverage` script

## Fixes Applied This Session

1. Updated version numbers in docs/api/ (types, core, cli, orchestrator)
2. Updated MCP resource count in README.md (8 → 9)
3. Updated Node version in implementation guide (18 → 22)
4. Removed phantom dependencies from graph README

## Remaining Items

- [ ] Align @anthropic-ai/sdk versions between intelligence and orchestrator
- [ ] Fix orchestrator README broken API examples
- [ ] Fix root README broken HarnessConfigSchema import example
- [ ] Add .tsx to ESLint TypeScript file patterns
- [ ] Add "type": "module" to core, graph, intelligence, orchestrator, types
- [ ] Add engines field to publishable packages
- [ ] Resolve core→graph layer inversion (2 imports)
- [ ] Fix dashboard chat types circular import
- [ ] Remove 61 dead exports across packages
- [ ] Remove 3 redundant CLI dependencies
- [ ] Add code splitting to dashboard build
- [ ] Create packages/dashboard/README.md
- [ ] Create docs/api/ entries for intelligence and dashboard
- [ ] Fix linter-gen generator version constant (0.1.4 → 0.1.6)
