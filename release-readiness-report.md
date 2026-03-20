# Release Readiness Report

**Date:** 2026-03-20
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: FAIL**

| Category                   | Passed                         | Warnings | Failures |
| -------------------------- | ------------------------------ | -------- | -------- |
| Packaging                  | 70/72                          | 0        | 2        |
| Documentation              | 5/6                            | 1        | 0        |
| Repo Hygiene               | 4/5                            | 1        | 0        |
| CI/CD                      | 6/6                            | 0        | 0        |
| Maintenance — Doc Drift    | 8 issues                       | —        | —        |
| Maintenance — Dead Code    | 7 orphans + ~30 unused exports | —        | —        |
| Maintenance — Architecture | 4 violations                   | —        | —        |
| Maintenance — Diagnostics  | 1 error, 6 warnings            | —        | —        |

## Packaging

### All 7 packages — field checks (70/70 pass)

Every package has: name, version, license, exports/main, files, publishConfig, repository, bugs, homepage, description.

- [x] @harness-engineering/types — all fields present
- [x] @harness-engineering/core — all fields present
- [x] @harness-engineering/graph — all fields present
- [x] @harness-engineering/cli — all fields present
- [x] @harness-engineering/mcp-server — all fields present
- [x] @harness-engineering/eslint-plugin — all fields present
- [x] @harness-engineering/linter-gen — all fields present

### Build & Pack

- [ ] **Build fails (FAIL):** `pnpm build` errors with "cyclic dependency detected: @harness-engineering/cli, @harness-engineering/mcp-server". Turbo cannot resolve the dependency graph. The cycle is documented in cli's package.json but breaks the build pipeline.
- [ ] **pnpm pack (FAIL):** Skipped — requires successful build.

## Documentation

- [x] README.md exists
- [x] README has install/quickstart section
- [ ] README missing explicit Usage/API section (warn)
- [x] CHANGELOG.md exists
- [x] CHANGELOG has entries
- [x] LICENSE file exists

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env (fixed this session)
- [ ] 170 TODO/FIXME in dist/ files (warn)

## CI/CD

- [x] CI workflow: .github/workflows/ci.yml
- [x] Release workflow: .github/workflows/release.yml
- [x] test script exists
- [x] lint script exists
- [x] typecheck script exists
- [x] harness validate passes

## Maintenance Results

### Doc Drift (8 issues — 3 fixed this session)

Fixed this session:

- AGENTS.md: skills count updated 37→42 (CC), 38→43 (Gemini)
- AGENTS.md: personas count updated 10→12, added planner and verifier to list
- README.md: ESLint plugin rule count updated 5→8

Remaining:

- docs/api/index.md missing @harness-engineering/graph package
- README.md line 82: MCP server tool count may need verification
- AGENTS.md and docs may have additional minor count discrepancies

### Dead Code (7 orphan files + ~30 unused exports)

**Orphan barrel files (7):**

- packages/eslint-plugin/src/configs/index.ts, recommended.ts, strict.ts
- packages/eslint-plugin/src/utils/index.ts
- packages/core/src/entropy/fixers/index.ts
- packages/core/src/entropy/config/index.ts
- packages/core/src/entropy/detectors/index.ts

**High-confidence unused exports:**

- `checkConfigPattern` in core/src/entropy/detectors/patterns.ts (test-only)
- `STANDARD_COGNITIVE_MODES`, `SkillError` in types (zero consumers)
- 4 unused schemas in eslint-plugin/src/utils/schema.ts

**Public API surface (lower confidence):**

- ~20 symbols re-exported from package barrels with zero external consumers (may be intentionally public)

4 previously reported orphans resolved: glob-helper.ts, schema.ts, merger.ts, and eslint-plugin/utils/schema.ts file itself.

### Architecture (4 violations)

| From       | To         | Severity            | Files                           |
| ---------- | ---------- | ------------------- | ------------------------------- |
| cli        | mcp-server | CRITICAL (circular) | 1 (harness-mcp.ts)              |
| mcp-server | cli        | CRITICAL (circular) | 7 (1 static, 6 dynamic imports) |
| cli        | linter-gen | MEDIUM (standalone) | 2                               |
| mcp-server | linter-gen | MEDIUM (standalone) | 1                               |

The cli↔mcp-server cycle is documented/intentional but breaks `turbo build`.

### Diagnostics (1 error, 6 warnings)

- **ERROR:** Node.js v21.6.1 vs required >=22.0.0
- **WARN:** deprecated `validateAgentsMap()`/`validateKnowledgeMap()` still called (5 sites)
- **WARN:** `@types/node` version split (^22 vs ^20) across packages
- **WARN:** `vitest` major version split (^4 vs ^2) across packages
- **WARN:** `minimatch` major version split (^10 vs ^9) across packages
- **WARN:** `harness check-perf` cannot resolve entry points

## Fixes Applied This Session

1. Added `.env` to `.gitignore` (was only covering `.env*.local`)
2. Updated AGENTS.md: skills 37→42 (CC), 38→43 (Gemini), personas 10→12
3. Updated README.md: ESLint plugin "5 rules" → "8 rules" with full list

## Remaining Items

### Blocking (must fix before release)

- [ ] Fix build: resolve cli↔mcp-server cyclic dependency for turbo (options: turbo config override, extract shared package, or restructure)
- [ ] Upgrade Node.js to >=22.0.0

### Non-blocking (should fix)

- [ ] Add explicit Usage/API section to README.md
- [ ] Review and resolve 170 TODO/FIXME in dist/ files
- [ ] Migrate deprecated `validateAgentsMap()`/`validateKnowledgeMap()` calls to `Assembler.checkCoverage()` (5 call sites)
- [ ] Align `@types/node` versions across packages (standardize on ^22)
- [ ] Align `vitest` versions across packages (standardize on ^4)
- [ ] Align `minimatch` versions across packages (standardize on ^10)
- [ ] Add @harness-engineering/graph to docs/api/index.md
- [ ] Remove 7 orphan barrel files
- [ ] Clean up unused exports (checkConfigPattern, STANDARD_COGNITIVE_MODES, SkillError, 4 schema exports)
- [ ] Configure `harness check-perf` entry points

## Delta from Previous Run (2026-03-19)

```
Previous: 86/91 passed (FAIL)
Current:  85/89 passed (FAIL)

Since last run:
  ✓ 4 items fixed (graph publishConfig/repository/bugs/homepage)
  ✓ 3 items fixed this session (.gitignore .env, AGENTS.md counts, README ESLint count)
  ✓ 4 dead code orphans resolved (glob-helper.ts, schema.ts, merger.ts, utils/schema.ts)
  ↑ 1 new architecture finding (cli→mcp-server now tracked separately)
  ↑ ~20 new unused export findings (deeper scan this run)
  → 2 blocking failures remain (build, Node.js version)
```
