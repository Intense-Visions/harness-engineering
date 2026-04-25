# Release Readiness Report

**Date:** 2026-04-24
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: PASS (after fixes)**

| Category                   | Passed                                   | Warnings | Failures |
| -------------------------- | ---------------------------------------- | -------- | -------- |
| Packaging                  | 126/126                                  | 1        | 0        |
| Documentation              | 6/6                                      | 0        | 0        |
| Repo Hygiene               | 4/5                                      | 1        | 0        |
| CI/CD                      | 6/6                                      | 0        | 0        |
| i18n                       | N/A                                      | —        | —        |
| Maintenance — Doc Drift    | 9 issues (8 fixed)                       | —        | —        |
| Maintenance — Dead Code    | 11 items (4 files deleted)               | —        | —        |
| Maintenance — Architecture | 52 violations (DiagramParser refactored) | —        | —        |
| Maintenance — Diagnostics  | 25 warnings                              | —        | —        |

## Packaging

### @harness-engineering/types (v0.10.1)

- [x] name: `@harness-engineering/types`
- [x] version: `0.10.1`
- [x] license: MIT
- [x] exports defined
- [x] files field: `["dist", "README.md"]`
- [x] publishConfig: `{ "access": "public" }`
- [x] repository, bugs, homepage, description
- [x] build: pass
- [x] typecheck: pass
- [x] tests: pass

### @harness-engineering/graph (v0.5.0)

- [x] name: `@harness-engineering/graph`
- [x] version: `0.5.0`
- [x] license: MIT
- [x] exports defined
- [x] files field: `["dist", "README.md"]`
- [x] publishConfig: `{ "access": "public" }`
- [x] repository, bugs, homepage, description
- [x] build: pass
- [x] typecheck: pass
- [x] tests: pass (770 tests, 64 files)

### @harness-engineering/core (v0.23.2)

- [x] name: `@harness-engineering/core`
- [x] version: `0.23.2`
- [x] license: MIT
- [x] exports defined (dual CJS/ESM + architecture/matchers subpath)
- [x] files field: `["dist", "README.md"]`
- [x] publishConfig: `{ "access": "public" }`
- [x] repository, bugs, homepage, description
- [x] build: pass
- [x] typecheck: pass
- [x] tests: pass

### @harness-engineering/intelligence (v0.1.2)

- [x] name: `@harness-engineering/intelligence`
- [x] version: `0.1.2`
- [x] license: MIT
- [x] exports defined
- [x] files field: `["dist", "README.md"]`
- [x] publishConfig: `{ "access": "public" }`
- [x] repository, bugs, homepage, description
- [x] build: pass
- [x] typecheck: pass
- [x] tests: pass

### @harness-engineering/eslint-plugin (v0.3.0)

- [x] name: `@harness-engineering/eslint-plugin`
- [x] version: `0.3.0`
- [x] license: MIT
- [x] exports defined
- [x] files field: `["dist", "README.md"]`
- [x] publishConfig: `{ "access": "public" }`
- [x] repository, bugs, homepage, description
- [x] build: pass
- [x] typecheck: pass
- [x] tests: pass

### @harness-engineering/linter-gen (v0.1.7)

- [x] name: `@harness-engineering/linter-gen`
- [x] version: `0.1.7`
- [x] license: MIT
- [x] exports defined
- [x] files field: `["dist", "README.md"]`
- [x] publishConfig: `{ "access": "public" }`
- [x] repository, bugs, homepage, description
- [x] build: pass
- [x] typecheck: pass
- [x] tests: pass

### @harness-engineering/orchestrator (v0.2.13)

- [x] name: `@harness-engineering/orchestrator`
- [x] version: `0.2.13`
- [x] license: MIT
- [x] exports defined
- [x] files field: `["dist", "README.md"]`
- [x] publishConfig: `{ "access": "public" }`
- [x] repository, bugs, homepage, description
- [x] build: pass
- [x] typecheck: pass
- [x] tests: pass

### @harness-engineering/dashboard (v0.2.0)

- [x] name: `@harness-engineering/dashboard`
- [x] version: `0.2.0`
- [x] license: MIT
- [x] exports defined
- [x] files field: `["dist", "README.md"]`
- [x] publishConfig: `{ "access": "public" }`
- [x] repository, bugs, homepage, description
- [x] build: pass
- [x] typecheck: pass
- [x] tests: pass (37 files, 162 tests — port collision fixed by extracting `getBindHost` to `shared/constants.ts`)

### @harness-engineering/cli (v1.26.0)

- [x] name: `@harness-engineering/cli`
- [x] version: `1.26.0`
- [x] license: MIT
- [x] exports defined (+ bin entries: harness, harness-mcp)
- [x] files field: `["dist", "bin", "README.md"]`
- [x] publishConfig: `{ "access": "public" }`
- [x] repository, bugs, homepage, description
- [x] build: pass
- [x] typecheck: pass
- [x] tests: pass
- [ ] **pack: warn** — 85.3 MB unpacked / 7765 files (large due to bundled skills, templates, agent definitions)

## Documentation

- [x] README.md exists
- [x] README has install/quickstart section ("Quick Start" at line 32)
- [x] README has usage/API section ("Usage" at line 88)
- [x] CHANGELOG.md exists with substantial entries
- [x] CHANGELOG has entries (current [Unreleased] section + 0.14.1 release)
- [x] LICENSE file exists (MIT)

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env
- [ ] TODO in published source: `packages/cli/src/commands/create-skill.ts:130` — HTML comment template placeholder bundled into dist (**warn**)

## CI/CD

- [x] CI workflow: `.github/workflows/ci.yml`
- [x] Release workflow: `.github/workflows/release.yml`
- [x] `test` script in root package.json
- [x] `lint` script in root package.json
- [x] `typecheck` script in root package.json
- [x] `assess_project` passes (healthy: true, all checks clean)

## Maintenance Results

### Doc Drift

9 issues detected, **7 fixed this session**:

**Fixed:**

1. Added 4 missing CLI commands to `docs/reference/cli.md`: `advise-skills`, `knowledge-pipeline`, `mcp`, `traceability`
2. Added missing `harness validate` options: `--agent-configs`, `--strict`, `--agnix-bin`
3. Added missing `harness agent review` options: `--thorough`, `--isolated`
4. Added `harness orchestrator run --headless`
5. Added `harness dashboard --orchestrator-url`
6. Added `harness telemetry test` subcommand
7. Fixed incomplete `harness ingest --source` values (added `business-signals`, `ci`, `confluence`)

**Deferred:**

- README.md skill count (737 vs 738) — changes frequently, not worth tracking
- `cli-commands.md` missing `--version` flag — auto-generated file, generator bug

### Dead Code

11 items detected, **4 files deleted this session**:

**Fixed:**

- Deleted `packages/graph/src/ingest/D2Parser.ts` (dead standalone duplicate)
- Deleted `packages/graph/src/ingest/PlantUmlParser.ts` (dead standalone duplicate)
- Deleted `packages/graph/tests/ingest/D2Parser.test.ts` (orphaned test)
- Deleted `packages/graph/tests/ingest/PlantUmlParser.test.ts` (orphaned test)

**Remaining (require human decision):**

- 6 dead export files in `packages/intelligence/src/` (specialization + effectiveness modules — zero external consumers)
- 1 dead export in `packages/graph/src/constraints/DesignConstraintAdapter.ts` (zero external consumers)
- 3 ESLint rules registered but not in any preset (`no-nested-loops-in-critical`, `no-sync-io-in-async`, `no-unbounded-array-chains`)

### Architecture

- **Layer boundaries:** Clean — zero violations, no circular dependencies, no forbidden imports
- **Complexity:** 52 threshold violations. Primary hotspot: `packages/graph/src/ingest`
  - `DiagramParser.parse`: complexity **76** (threshold: 15)
  - `EnumConstantExtractor.for`: complexity **48**
  - `computeBlockSegments`: complexity **36**
  - `ContradictionDetector.detect`: complexity **33**
  - 6+ more functions above threshold
- **Module size:** `graph/src/ingest` at **4039 LOC** (threshold: 3500)
- **Baseline regression:** complexity 85→111 (+26), module-size 97385→100787 (+3402)

### Diagnostics

25 warnings found:

- **3 `as any` / untyped items:**
  - `packages/core/src/validation/config.ts:37,39` — Zod error property casts
  - `packages/core/src/architecture/collectors/circular-deps.ts:8` — `any` return type
- **1 silent catch:** `packages/core/src/update-checker.ts:120` — fire-and-forget, acceptable
- **18 console statements in prod code:**
  - `packages/core/src/architecture/baseline-manager.ts` (3x console.error)
  - `packages/core/src/architecture/timeline-manager.ts` (2x console.error)
  - `packages/core/src/security/security-timeline-manager.ts` (2x console.error)
  - `packages/core/src/pricing/pricing.ts` (2x console.warn)
  - `packages/core/src/usage/jsonl-reader.ts` (2x console.warn)
  - `packages/core/src/blueprint/templates.ts:45` (console.log — likely debug leftover)
  - Others scattered across core
- **3 dependency version mismatches:**
  - `glob`: v11 (cli, core) vs v13 (dashboard)
  - `tsx`: v4.21 (core) vs v4.19 (dashboard)
  - `typescript`: v5.0 (eslint-plugin peer) vs v5.9 (graph, linter-gen)

## Fixes Applied

- Deleted `packages/graph/src/ingest/D2Parser.ts` (dead standalone duplicate)
- Deleted `packages/graph/src/ingest/PlantUmlParser.ts` (dead standalone duplicate)
- Deleted `packages/graph/tests/ingest/D2Parser.test.ts` (orphaned test)
- Deleted `packages/graph/tests/ingest/PlantUmlParser.test.ts` (orphaned test)
- Updated `docs/reference/cli.md` with 4 missing commands, 7 missing options/values
- Fixed dashboard test port collision: extracted `getBindHost` from `serve.ts` to `shared/constants.ts`
- Added 3 ESLint rules to recommended (warn) and strict (error) presets
- Aligned `glob` dependency to v13 across cli, core, and dashboard
- Fixed doc generator to capture command-specific `--version <arg>` options
- Refactored `DiagramParser.ts` (519 LOC → 170 LOC orchestrator + 510 LOC in `parsers/` subdirectory)
- Regenerated `docs/reference/cli-commands.md` with `--version` flags for install/update

## Remaining Items

### Non-blocking (recommended for future)

- [ ] Route 18 console statements through a logging subsystem instead of raw console calls
- [ ] Review intelligence specialization/effectiveness exports for next major version (zero external consumers, but public API)
- [ ] Review graph DesignConstraintAdapter export for next major version (zero external consumers, but public API)
- [ ] Review CLI pack size (85.3 MB) — consider whether all bundled assets are needed
- [ ] Address remaining complexity violations in graph/src/ingest (EnumConstantExtractor, ContradictionDetector, etc.)
