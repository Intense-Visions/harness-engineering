# Release Readiness Report

**Date:** 2026-03-19
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: FAIL** (1 failure resolved during this session; remaining issues are warnings and maintenance findings)

| Category                   | Passed | Warnings          | Failures |
| -------------------------- | ------ | ----------------- | -------- |
| Packaging                  | 70/70  | 4                 | 0\*      |
| Documentation              | 6/6    | 0                 | 0        |
| Repo Hygiene               | 4/5    | 1                 | 0        |
| CI/CD                      | 6/6    | 0                 | 0        |
| Maintenance — Doc Drift    | —      | 13 issues         | —        |
| Maintenance — Dead Code    | —      | 13 issues         | —        |
| Maintenance — Architecture | —      | 3 violations      | —        |
| Maintenance — Diagnostics  | —      | 1 warning, 2 info | —        |

_\* `@harness-engineering/graph` license field was missing (fail) — fixed during this session._

## Packaging

### @harness-engineering/cli [all pass]

- [x] name, version, license, exports, files, publishConfig, repository, bugs, homepage, description

### @harness-engineering/core [all pass]

- [x] name, version, license, exports, files, publishConfig, repository, bugs, homepage, description

### @harness-engineering/eslint-plugin [all pass]

- [x] name, version, license, exports, files, publishConfig, repository, bugs, homepage, description

### @harness-engineering/graph [pass after fix, 4 warnings]

- [x] name, version, license (fixed this session), exports, files, description
- [ ] publishConfig missing (warn)
- [ ] repository missing (warn)
- [ ] bugs missing (warn)
- [ ] homepage missing (warn)

### @harness-engineering/linter-gen [all pass]

- [x] name, version, license, exports, files, publishConfig, repository, bugs, homepage, description

### @harness-engineering/mcp-server [all pass]

- [x] name, version, license, exports, files, publishConfig, repository, bugs, homepage, description

### @harness-engineering/types [all pass]

- [x] name, version, license, exports, files, publishConfig, repository, bugs, homepage, description

### Build

- [x] `pnpm build` succeeds (8/8 tasks)

## Documentation

- [x] README.md exists
- [x] README has install section
- [x] README has usage/API section
- [x] CHANGELOG.md exists with entries
- [x] LICENSE exists

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env
- [ ] 233 TODO/FIXME in published dist files (warn)

## CI/CD

- [x] CI workflow exists (.github/workflows/ci.yml)
- [x] Release workflow exists (.github/workflows/release.yml)
- [x] test script exists
- [x] lint script exists
- [x] typecheck script exists
- [x] harness validate passes

## Maintenance Results

### Doc Drift: 13 issues

| #   | File                           | Line | Issue                                                                |
| --- | ------------------------------ | ---- | -------------------------------------------------------------------- |
| 1   | docs/guides/getting-started.md | 94   | Skills count says 31, actual 37/38                                   |
| 2   | docs/guides/getting-started.md | 177  | MCP tools says 31, actual 35                                         |
| 3   | docs/guides/getting-started.md | 220  | Says "six principles", should be seven                               |
| 4   | README.md                      | 37   | `harness init my-project` should be `harness init --name my-project` |
| 5   | README.md                      | 58   | ESLint plugin says 5 rules, actual 8                                 |
| 6   | README.md                      | 60   | MCP server says 37 tools/11 resources, actual 35/8                   |
| 7   | README.md                      | 92   | Repeats wrong 37 tools/11 resources count                            |
| 8   | README.md                      | 140  | Skills count says 26, actual 37                                      |
| 9   | README.md                      | 141  | Personas count says 6, actual 10                                     |
| 10  | AGENTS.md                      | 36   | Claude-code skills says 36, actual 37                                |
| 11  | AGENTS.md                      | 37   | Gemini-cli skills says 37, actual 38                                 |
| 12  | docs/api/index.md              | 12   | MCP tools says 37, actual 35                                         |
| 13  | docs/guides/getting-started.md | 66   | Inconsistent init syntax with README                                 |

### Dead Code: 13 issues

**Orphan files (10):**

- packages/eslint-plugin/src/configs/recommended.ts — never imported
- packages/eslint-plugin/src/configs/strict.ts — never imported
- packages/eslint-plugin/src/configs/index.ts — barrel, never imported
- packages/mcp-server/src/utils/glob-helper.ts — completely dead
- packages/cli/src/templates/schema.ts — test-only consumer
- packages/cli/src/templates/merger.ts — test-only consumer
- packages/core/src/entropy/fixers/index.ts — orphan barrel
- packages/core/src/entropy/config/index.ts — orphan barrel
- packages/core/src/entropy/detectors/index.ts — orphan barrel
- packages/eslint-plugin/src/utils/index.ts — orphan barrel

**Unused exports (3):**

- packages/eslint-plugin/src/utils/schema.ts — all exports test-only
- packages/core/src/entropy/detectors/patterns.ts:27 — `checkConfigPattern`
- packages/core/src/shared/parsers/index.ts:4 — `Location` type

### Architecture: 3 violations

1. **CLI → linter-gen** — CLI imports from sibling package not in allowed dependencies
2. **MCP Server → CLI** — MCP Server imports from higher-layer package (7 source files). Most significant violation.
3. **MCP Server → linter-gen** — MCP Server imports from package not in allowed dependencies

**Recommendation:** Extract shared logic (template engine, persona runner, skill generator, slash commands) from CLI into core or a new shared package.

### Diagnostics: 1 warning, 2 info

- **Warning:** Node.js 21.6.1 in use, project requires >=22.0.0
- **Info:** `validateKnowledgeMap()` deprecated → use `Assembler.checkCoverage()`
- **Info:** `validateAgentsMap()` deprecated → use `Assembler.checkCoverage()`

## Fixes Applied

- Added `"license": "MIT"` to packages/graph/package.json

## Remaining Items

- [ ] Add publishConfig, repository, bugs, homepage to packages/graph/package.json
- [ ] Audit 233 TODO/FIXME in dist files
- [ ] Fix 13 doc drift issues (delegate to `/harness:align-documentation`)
- [ ] Review and remove 10 orphan files + 3 unused exports
- [ ] Plan architectural refactor: extract shared CLI logic for MCP Server consumption
- [ ] Upgrade Node.js to >=22.0.0
- [ ] Remove 2 deprecated functions after consumer migration
