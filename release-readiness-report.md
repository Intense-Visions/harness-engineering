# Release Readiness Report

**Date:** 2026-04-08
**Project:** harness-engineering
**Flags:** standard
**Previous Run:** 2026-04-07T15:45:00Z

## Summary

**Result: FAIL**

One pre-existing failure remains: codex platform parity (1042 skills missing codex variants). All other checks pass.

| Category                   | Passed       | Warnings | Failures |
| -------------------------- | ------------ | -------- | -------- |
| Packaging                  | 74/74        | 0        | 0        |
| Documentation              | 6/6          | 0        | 0        |
| Repo Hygiene               | 5/5          | 0        | 0        |
| CI/CD                      | 5/5          | 0        | 0        |
| Tests                      | 17/18        | 0        | 1        |
| Maintenance — Doc Drift    | 0 remaining  | —        | —        |
| Maintenance — Dead Code    | 1 issue      | —        | —        |
| Maintenance — Architecture | 0 violations | —        | —        |
| Maintenance — Diagnostics  | 5 warnings   | —        | —        |

## Delta from Previous Run (2026-04-07)

```
Since last run:
  ✓ assess_project now passes (was fail — stale global CLI)
  ✓ skill.yaml schema validation fixed (404/429 → "404"/"429" across 6 files)
  ✓ harness-router SKILL.md missing Examples section fixed
  ✓ VERSION constant updated (0.15.0 → 0.21.1)
  ✓ liquidjs bumped to >=10.25.3 (HIGH vuln resolved)
  ✓ Skills count updated (81 → 485) in README.md + getting-started.md
  ✓ MCP tool count updated (54 → 57) in README.md + getting-started.md
  ✓ API doc versions aligned with package.json (cli, core, graph, linter-gen)
  ✓ Install instructions aligned to `harness setup` in getting-started.md
  ✓ CONTRIBUTING.md project structure corrected

  → Pre-existing: codex platform parity (1042 skills need codex variants)
  → Pre-existing: dead file graph-scanner.ts
```

## Packaging

### All 7 publishable packages — PASS

- [x] @harness-engineering/cli (1.23.2) — all fields present
- [x] @harness-engineering/core (0.21.1) — all fields present
- [x] @harness-engineering/eslint-plugin (0.2.3) — all fields present
- [x] @harness-engineering/graph (0.4.1) — all fields present
- [x] @harness-engineering/linter-gen (0.1.5) — all fields present
- [x] @harness-engineering/orchestrator (0.2.5) — all fields present
- [x] @harness-engineering/types (0.9.0) — all fields present

@harness-engineering/dashboard (0.1.1) — private, not published

## Documentation

- [x] README.md exists with install + usage sections
- [x] CHANGELOG.md exists with entries (current: 0.14.1)
- [x] LICENSE file exists (MIT)
- [x] README contains install/quickstart section
- [x] README contains usage/API section
- [x] CHANGELOG has substantive entries

## Repo Hygiene

- [x] CONTRIBUTING.md exists (updated project structure)
- [x] CODE_OF_CONDUCT.md exists
- [x] SECURITY.md exists
- [x] .gitignore covers node_modules, dist, .env
- [x] No TODO/FIXME in published source (template TODO in create-skill.ts is intentional scaffold content)

## CI/CD

- [x] CI workflow: .github/workflows/ci.yml
- [x] Release workflow: .github/workflows/release.yml
- [x] test, lint, typecheck scripts present
- [x] assess_project passes (healthy=true, all 7 checks pass)
- [x] Build succeeds (9/9 tasks)

## Tests

- [x] Typecheck passes (13/13 tasks)
- [x] Build succeeds (9/9 tasks)
- [x] CLI tests pass (2004/2004)
- [x] Core tests pass
- [x] Skills structure tests pass (5456/5456)
- [x] Skills schema tests pass
- [x] Skills references tests pass
- [ ] **FAIL: Platform parity** — 1042 codex skills missing (pre-existing, needs `harness generate` for codex platform)

## Maintenance Results

### Doc Drift

17 findings detected, 10 fixed this session:

- ✓ Skills count 81→485 (README.md, getting-started.md)
- ✓ MCP tool count 54→57 (README.md, getting-started.md)
- ✓ Version drift in docs/api/ (cli, core, graph, linter-gen)
- ✓ VERSION constant 0.15.0→0.21.1 (code + docs)
- ✓ Install instructions aligned to `harness setup`
- ✓ CONTRIBUTING.md project structure corrected
- ✓ Inspirations count 42→50

Remaining (medium priority):

- [ ] ESLint plugin docs: recommended config missing `require-path-normalization` rule
- [ ] ESLint plugin docs: "Enables all rules" claim incorrect (8/11)
- [ ] Missing docs/api/dashboard.md (dashboard is private — may not need API docs)
- [ ] Missing orchestrator version in docs/api/orchestrator.md

### Dead Code

- `packages/core/src/blueprint/graph-scanner.ts` — dead file, only test imports it. Pending human decision on deletion.

### Architecture

**0 violations.** All clean.

- Layer boundaries: PASS (types→core→cli, no reverse imports)
- Circular dependencies: PASS (570 files, zero cycles)
- Forbidden imports: PASS
- Known fixture: `complexRouter` CC=16 in test file (intentional)

### Diagnostics

**12 vulnerabilities found (3 resolved this session via liquidjs bump):**

- ✓ FIXED: liquidjs HIGH (GHSA-56p5-8mhr-2fph) — bumped to >=10.25.3
- ✓ FIXED: liquidjs moderate (GHSA-v273-448j-v4qj) — resolved by bump
- ✓ FIXED: liquidjs low (GHSA-mmg9-6m6j-jqqx) — resolved by bump
- 6x moderate: hono via @modelcontextprotocol/sdk — blocked on upstream release
- 2x moderate: esbuild + vite via vitepress — dev-only, known
- 1x moderate: liquidjs (GHSA-rv5g-f82m-qrvv) — may need >=10.25.4 if not covered
- Build warning: import.meta CJS in parser.ts (has runtime fallback)

## Fixes Applied This Session

1. Quote `404` keyword in next-error-boundaries/skill.yaml (3 platforms)
2. Quote `429` keyword in resilience-rate-limiting/skill.yaml (3 platforms)
3. Add `## Examples` section to harness-router/SKILL.md
4. Bump liquidjs to >=10.25.3 in packages/orchestrator/package.json
5. Update VERSION constant from 0.15.0 to 0.21.1 in packages/core/src/index.ts
6. Update skills count from 81 to 485 in README.md and getting-started.md
7. Update MCP tool count from 54 to 57 in README.md and getting-started.md
8. Update inspirations count from 42 to 50 in README.md
9. Update doc versions: cli 1.23.1→1.23.2, core 0.21.0→0.21.1, graph 0.4.0→0.4.1, linter-gen 0.1.4→0.1.5
10. Update VERSION constant in docs/api/core.md from 0.15.0 to 0.21.1
11. Align getting-started.md install instructions to use `harness setup`
12. Update CONTRIBUTING.md project structure (remove mcp-server, add orchestrator + dashboard)

## Remaining Items

- [ ] Generate codex platform skills (1042 missing — blocks PASS)
- [ ] Delete or justify dead file `packages/core/src/blueprint/graph-scanner.ts`
- [ ] Update ESLint plugin docs (recommended config accuracy)
- [ ] Add orchestrator version to docs/api/orchestrator.md
- [ ] Monitor hono/MCP SDK for upstream fix (6 moderate advisories)
