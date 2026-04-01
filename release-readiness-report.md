# Release Readiness Report

**Date:** 2026-04-01
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: PASS**

| Category                   | Passed              | Warnings | Failures |
| -------------------------- | ------------------- | -------- | -------- |
| Packaging                  | 77/77               | 1        | 0        |
| Documentation              | 6/6                 | 0        | 0        |
| Repo Hygiene               | 5/5                 | 0        | 0        |
| CI/CD                      | 6/6                 | 0        | 0        |
| Maintenance — Doc Drift    | 4 remaining (warn)  | —        | —        |
| Maintenance — Dead Code    | 5 issues (warn)     | —        | —        |
| Maintenance — Architecture | 6 complexity (warn) | —        | —        |
| Maintenance — Diagnostics  | 2 issues (warn)     | —        | —        |

## Packaging

### All 7 Packages — PASS

| Package                            | Version | Build | Typecheck | Tests       | Metadata   |
| ---------------------------------- | ------- | ----- | --------- | ----------- | ---------- |
| @harness-engineering/cli           | 1.15.0  | PASS  | PASS      | PASS (1633) | All fields |
| @harness-engineering/core          | 0.15.0  | PASS  | PASS      | PASS (1520) | All fields |
| @harness-engineering/types         | 0.5.0   | PASS  | PASS      | PASS        | All fields |
| @harness-engineering/graph         | 0.3.3   | PASS  | PASS      | PASS        | All fields |
| @harness-engineering/orchestrator  | 0.2.3   | PASS  | PASS      | PASS        | All fields |
| @harness-engineering/eslint-plugin | 0.2.3   | PASS  | PASS      | PASS        | All fields |
| @harness-engineering/linter-gen    | 0.1.4   | PASS  | PASS      | PASS        | All fields |

Warning: CLI `npm pack` includes 4 test files in tarball.

## Documentation

- [x] README.md exists with install/quickstart and usage sections
- [x] CHANGELOG.md exists with entries (v0.9.0)
- [x] LICENSE file exists (MIT)

## Repo Hygiene

- [x] CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md exist
- [x] .gitignore covers node_modules, dist, .env
- [x] No TODO/FIXME in published source files

## CI/CD

- [x] CI workflow: `.github/workflows/ci.yml`
- [x] Release workflow: `.github/workflows/release.yml`
- [x] test, lint, typecheck scripts in root package.json
- [x] Lint passes clean

## Maintenance Results

### Doc Drift (4 remaining — all warnings, not blocking)

- `docs/api/index.md:31-41` — Assembler code example has wrong constructor/return type
- `docs/api/graph.md:25` — ContextQL uses `run()` instead of `execute()`
- `README.md:90` — `HarnessConfigSchema` import not exported from CLI package
- `docs/api/graph.md:33` — VERSION export `0.2.0` vs package.json `0.3.3`

### Dead Code (5 items — warnings)

1. `packages/core/src/blueprint/impact-lab-generator.ts` — orphan file
2. `packages/core/src/shared/llm.ts` — dead exports MockLLMService, LLMService
3. `packages/orchestrator/src/tracker/extensions/linear.ts` — dead exports (Phase 4 stub)
4. `packages/core/src/blueprint/graph-scanner.ts` — orphan file
5. `packages/graph/src/index.ts:56-57` — dead re-exports ConfluenceConnector, CIConnector

### Architecture (6 complexity violations — warnings)

| File                                              | Function                  | CC  | Threshold |
| ------------------------------------------------- | ------------------------- | --- | --------- |
| `core/src/usage/aggregator.ts`                    | `aggregateBySession`      | 33  | 15        |
| `core/src/usage/aggregator.ts`                    | inner for-loop            | 29  | 15        |
| `core/src/usage/aggregator.ts`                    | `aggregateByDay`          | 19  | 15        |
| `cli/src/commands/generate-slash-commands.ts`     | `generateSlashCommands`   | 17  | 15        |
| `cli/src/commands/generate-slash-commands.ts`     | inner for-loop            | 17  | 15        |
| `core/tests/entropy/detectors/complexity.test.ts` | `complexRouter` (fixture) | 16  | 15        |

### Diagnostics (2 items — warnings)

1. `docs/changes/force-multiplier-integrations/proposal.md` — unescaped `<name>` tags break VitePress build
2. `core/src/code-nav/parser.ts:41` — `import.meta.url` CJS build warning

## Fixes Applied This Session

1. `core/src/security/injection-patterns.ts:36` — eslint-disable for intentional zero-width char regex
2. `README.md:168` — tool count 49 → 50
3. `docs/guides/getting-started.md:196` — tool count 46 → 50
4. `README.md:219` — skill count 79 → 80
5. `docs/api/core.md:5` — version 0.13.1 → 0.15.0
6. `docs/api/core.md:26` — VERSION comment 0.12.0 → 0.15.0
7. `docs/api/graph.md:5` — version 0.3.2 → 0.3.3
8. `cli/src/hooks/sentinel-pre.js` — fix lint errors (no-misleading-character-class, no-undef)
9. `cli/src/hooks/sentinel-post.js` — fix lint errors, remove unused import
10. `cli/src/hooks/pre-compact-state.js` — remove unused variable
11. `cli/src/commands/hooks/add.ts` — replace `any` types with `JsonObject` alias
12. `core/tests/state/gate.test.ts:27` — increase timeout for npm-spawning test
13. `cli/tests/hooks/profiles.test.ts` — update HOOK_SCRIPTS length 5 → 7
14. `cli/tests/hooks/hooks-cli-integration.test.ts` — update strict hooks length 5 → 7
15. `cli/src/hooks/cost-tracker.js` — fix snake_case → camelCase field names
16. `cli/tests/commands/doctor.test.ts` — fix mock to expose .gemini dir for MCP check
17. `cli/tests/commands/usage.test.ts` — mock fetch, increase timeout, fix JSON parsing

## Advisory Items (not blocking)

- [ ] Fix broken code examples in docs/api/ (Assembler, ContextQL)
- [ ] Fix HarnessConfigSchema import in README
- [ ] Sync graph VERSION export with package.json
- [ ] Escape `<name>` tags in docs proposal
- [ ] Decompose aggregateBySession (CC=33)
- [ ] Remove orphan files and dead exports
- [ ] Update architecture baselines
