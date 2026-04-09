# Release Readiness Report

**Date:** 2026-04-09
**Project:** harness-engineering
**Flags:** standard

## Summary

**Result: FAIL**

| Category                   | Passed       | Warnings | Failures |
| -------------------------- | ------------ | -------- | -------- |
| Packaging                  | 77/77        | 0        | 0        |
| Documentation              | 6/6          | 0        | 0        |
| Repo Hygiene               | 5/5          | 0        | 0        |
| CI/CD                      | 6/6          | 0        | 0        |
| Tests                      | 17/18        | 0        | 1        |
| Maintenance — Doc Drift    | 0 issues     | —        | —        |
| Maintenance — Dead Code    | 1 issue      | —        | —        |
| Maintenance — Architecture | 0 violations | —        | —        |
| Maintenance — Diagnostics  | 9 warnings   | —        | —        |

## Packaging

All 7 public packages pass all checks (name, version, license, exports, main, files, publishConfig, repository, bugs, homepage, description).

- @harness-engineering/types (0.9.0) — all fields present
- @harness-engineering/core (0.21.1) — all fields present
- @harness-engineering/cli (1.23.2) — all fields present
- @harness-engineering/graph (0.4.1) — all fields present
- @harness-engineering/eslint-plugin (0.2.3) — all fields present
- @harness-engineering/linter-gen (0.1.5) — all fields present
- @harness-engineering/orchestrator (0.2.5) — all fields present
- @harness-engineering/dashboard (0.1.1) — private, skipped

## Documentation

- [x] README.md exists
- [x] README has install/quickstart section
- [x] README has usage/API section
- [x] CHANGELOG.md exists with 17 versioned entries
- [x] LICENSE exists (MIT)

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env

## CI/CD

- [x] CI workflow: .github/workflows/ci.yml
- [x] Release workflow: .github/workflows/release.yml
- [x] test, lint, typecheck scripts present
- [x] assess_project passes (validate, deps, docs, entropy, perf, lint)
- [x] 3 security warnings from assess_project (non-blocking)

## Tests

- [x] Build succeeds (all 9 packages)
- [x] Typecheck passes (all 13 tasks)
- [x] Lint passes (all 8 tasks)
- [ ] **Tests FAIL: 1042 codex platform parity failures** — skill variants not generated for codex platform

## Maintenance Results

### Doc Drift

Clean (6 issues found and fixed this session).

### Dead Code

1 remaining issue:

- `packages/core/scripts/backfill-learnings-frontmatter.ts` — one-shot migration script, needs human review

### Architecture

Clean. 2 threshold findings (non-violations):

- Complexity in test fixture (false positive)
- Module-size regression +24 LOC (branch changes)

### Diagnostics

9 warnings (unchanged):

- 1 build warning: import.meta CJS fallback in parser.ts
- 8 moderate npm audit vulnerabilities (hono x6 production, esbuild + vite dev-only)

## Fixes Applied This Session

1. Updated MCP tool count 57→55 in README.md and getting-started.md
2. Added `require-path-normalization` to eslint-plugin.md recommended table
3. Corrected "Enables all rules" → "Enables 8 of 11 rules" with explanation
4. Updated graph `VERSION` constant 0.4.0→0.4.1 in code and doc
5. Updated eslint-plugin `meta.version` 0.1.0→0.2.3
6. Added 4 missing checks (security, perf, arch, traceability) to ci-cd-validation.md
7. Removed dead `ContentPipeline` re-export from core/src/index.ts
8. Deleted stale `packages/core/test/` duplicate directory
9. Deleted dead files: graph-scanner.ts, scratchpad.ts, checkpoint-commit.ts, learnings-relevance.ts
10. Removed barrel exports for deleted state modules

## Remaining Items

- [ ] **[BLOCKING]** Generate codex platform skill variants: `harness generate --platform codex`
- [ ] Bump hono to >=4.12.12 and @hono/node-server to >=1.19.13 (6 production advisories)
- [ ] Decide: add 3 performance ESLint rules to `strict` config, or document as opt-in
- [ ] Review `backfill-learnings-frontmatter.ts` — keep or delete
- [ ] Upgrade vitepress when vite >=6.4.2 release available (dev-only, low priority)
