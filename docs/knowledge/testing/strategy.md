---
type: business_concept
domain: testing
tags: [testing, vitest, coverage, strategy, isolation, fixtures]
---

# Testing Strategy

The monorepo uses a layered testing strategy built on Vitest with strict coverage enforcement and CI gating.

## Testing Stack

- **Framework:** Vitest 4.x with `globals: true` and `environment: 'node'`
- **Coverage provider:** V8 via `@vitest/coverage-v8`
- **Test location:** Co-located `tests/` directories within each package, plus `src/**/*.test.ts` files
- **Scale:** 788 test files containing 13,304 tests across 9 packages

## Coverage Enforcement

The `scripts/coverage-ratchet.mjs` script enforces a one-way ratchet on coverage:

- **Baselines** are stored in `coverage-baselines.json` at the repo root, keyed by package path
- **Metrics tracked:** lines, branches, functions, statements
- **V8 variance tolerance:** 0.5% -- V8 code coverage is non-deterministic due to JIT optimization, inline caching, and GC timing, so a small tolerance absorbs noise without masking real regressions
- **Check mode** (CI): `node scripts/coverage-ratchet.mjs` -- fails if any metric drops below baseline minus tolerance
- **Update mode:** `node scripts/coverage-ratchet.mjs --update` -- captures current coverage as the new baseline

Each package also sets per-metric thresholds in its `vitest.config.mts` (e.g., core requires 80% lines/functions/statements, 73% branches).

## Monorepo Execution

- **Full suite:** `turbo run test` parallelizes across packages respecting the dependency graph
- **Single package:** `pnpm --filter @harness-engineering/<pkg> test`
- **Each package** has its own `vitest.config.mts` with package-specific `include`, `exclude`, `testTimeout`, and `setupFiles`

## Key Patterns

- **Temp git repos:** Tests that need a git repository use `mkdtempSync` to create an isolated temp directory, initialize a git repo, and clean up in `afterEach`
- **Cleanup discipline:** Every test that creates filesystem artifacts must remove them in `afterEach` to prevent cross-test pollution
- **I/O timeouts:** I/O-heavy tests set per-test timeouts (default is 15s for core) to avoid hanging CI
- **Include scoping:** `include` patterns explicitly list `src/**/*.test.ts` and `tests/**/*.test.ts` to prevent Vitest from picking up compiled `dist/` artifacts

## CI Pipeline

The CI pipeline runs in two stages via git hooks:

**Pre-commit:**

- `eslint` -- lint all staged files
- `prettier --check` -- formatting validation
- `harness validate` -- project-level harness constraint checks

**Pre-push:**

- `pnpm format:check` -- full formatting pass
- `pnpm typecheck` -- TypeScript strict-mode compilation across all packages
- `pnpm test:ci` -- full test suite with coverage collection
- `node scripts/coverage-ratchet.mjs` -- baseline regression check
- `pnpm generate-docs --check` -- ensures generated docs are up to date
