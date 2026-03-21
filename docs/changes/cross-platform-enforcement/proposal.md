# Cross-Platform Support with Mechanical Enforcement

**Date:** 2026-03-21
**Status:** Proposed
**Keywords:** cross-platform, windows, path-handling, eslint, ci-matrix, enforcement, platform-parity

## Overview and Goals

Harness Engineering currently runs reliably only on Linux/macOS. This spec adds full native Windows/Mac/Linux support and introduces three enforcement layers to prevent platform-specific regressions from ever being reintroduced.

### Goals

1. All packages build, test, and run correctly on Windows, macOS, and Linux
2. CI validates all three platforms on every PR
3. ESLint rules catch platform-specific code patterns at authoring time
4. A dedicated test suite catches structural anti-patterns (Unix commands in scripts, shebang-only files, etc.)

### Non-goals

- Supporting Node versions below 22
- Adding Windows-native shell scripts (.bat/.ps1) — Node.js scripts replace Unix shell commands
- Platform-specific features or conditional behavior — the goal is uniform behavior across all OSes

## Assumptions

- **Runtime:** Node.js >= 22.0.0 (as specified in `engines` field). Uses stable `fs.rm()` and `fs.cp()` APIs.
- **Monorepo:** pnpm workspace with Turborepo orchestration.
- **CI:** GitHub Actions. Matrix expansion applies to the existing `ci.yml` workflow.
- **Module system:** ESM (`"type": "module"`) across all packages.
- **Existing ESLint plugin:** 8 rules in `@harness-engineering/eslint-plugin`, standard import/export pattern for rule registration.

## Decisions

| #   | Decision                                                                | Rationale                                                                               |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Full native support on all 3 OSes, not WSL-only                         | Users shouldn't need WSL to use harness on Windows                                      |
| 2   | Three enforcement layers: CI + ESLint + test suite                      | Defense in depth — catch issues at authoring time, lint time, and CI time               |
| 3   | Minimal CI matrix (3 OS x Node 22 only)                                 | Biggest win is going from 1 OS to 3. Second Node version adds cost without current need |
| 4   | Node.js scripts using `fs.rm()`/`fs.cp()` instead of `rimraf`/`cpy-cli` | Node 22 has stable recursive fs APIs. Zero new dependencies                             |
| 5   | ESLint rules in existing `@harness-engineering/eslint-plugin`           | Platform safety is the same category as existing architectural constraints              |
| 6   | Single root-level platform parity test suite                            | Repo-wide structural checks belong in one place, not duplicated per package             |
| 7   | Parallel development on feature branch, atomic merge                    | `main` stays green throughout. No window for regressions between fixes and enforcement  |

## Technical Design

### Source Fixes

#### Package.json script replacements

| Package    | Current                                                                             | Replacement                    |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| Root       | `rm -rf node_modules` in `clean`                                                    | `node scripts/clean.mjs`       |
| cli        | `cp -r ../../templates dist/templates && cp -r ../../agents dist/agents` in `build` | `node scripts/copy-assets.mjs` |
| cli        | `rm -rf dist` in `clean`                                                            | `node scripts/clean.mjs`       |
| core       | `rm -rf dist` in `clean`                                                            | `node scripts/clean.mjs`       |
| mcp-server | `rm -rf dist` in `clean`                                                            | `node scripts/clean.mjs`       |

Each package gets a minimal `scripts/clean.mjs` (~3 lines using `fs.rm()`). The CLI package gets an additional `scripts/copy-assets.mjs` using `fs.cp()`. Alternatively, a single root-level `scripts/clean.mjs` that accepts a path argument could serve all packages.

#### Source code fixes

| File                                             | Issue                                           | Fix                                                           |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------- |
| `packages/eslint-plugin/src/utils/path-utils.ts` | Hardcoded `/src/` separator on lines 22, 36, 66 | Normalize paths with `path.sep` or split on both `/` and `\\` |
| `packages/cli/src/commands/ci/init.ts`           | `fs.chmodSync(targetPath, '755')`               | Guard with `process.platform !== 'win32'` check               |

### ESLint Rules (added to `@harness-engineering/eslint-plugin`)

#### Rule 1: `no-unix-shell-command`

- Flags `exec()`, `execSync()` calls with string arguments containing Unix-specific commands (`rm`, `cp`, `mv`, `mkdir`, `chmod`, `chown`)
- Does NOT flag `execFile()`/`execFileSync()` with `git` or other cross-platform binaries
- Fixable: No (requires manual refactoring)

#### Rule 2: `no-hardcoded-path-separator`

- Flags string literals containing `'/src/'`, `'/dist/'`, or similar hardcoded Unix path segments when used in path comparison/manipulation contexts
- **Scope:** Only analyzes string arguments passed to `path.*` methods, `fs.*` methods, `indexOf()`, `includes()`, `startsWith()`, and `endsWith()` calls. Import/require specifiers, URL strings, and regex patterns are ignored.
- Fixable: No

### Platform Parity Test Suite

Location: `tests/platform-parity.test.ts` (root level)

Excludes: `node_modules/`, `dist/`, `coverage/`, `.harness/`, and any generated/third-party files.

Scans for:

1. **Package.json scripts** — Globs all `packages/*/package.json`, checks `scripts` values for `rm -rf`, `cp -r`, `mv `, `mkdir -p`, `chmod`
2. **Shebang-only files** — Finds all `.sh` files, warns if no cross-platform equivalent exists nearby
3. **Hardcoded path separators** — Scans `.ts` source files for patterns like `indexOf('/src/')` outside of comments/regex
4. **`fs.chmodSync` usage** — Flags unguarded calls (no `process.platform` check)
5. **`exec`/`execSync` with shell strings** — Flags usage where `execFile`/`execFileSync` would be safer

### CI Matrix Expansion

Update `.github/workflows/ci.yml`:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
  fail-fast: false
```

`fail-fast: false` ensures all 3 OS results are reported even if one fails.

## Success Criteria

1. `pnpm build` succeeds on Windows, macOS, and Linux — no Unix-specific commands remain in any package.json scripts
2. `pnpm test` passes on all 3 OSes — including the new platform parity test suite
3. `pnpm lint` catches platform-specific code — the two new ESLint rules (`no-unix-shell-command`, `no-hardcoded-path-separator`) flag violations in new code
4. CI runs on all 3 OSes for every PR — GitHub Actions matrix includes `ubuntu-latest`, `windows-latest`, `macos-latest`
5. Zero new dependencies added — all cross-platform fixes use Node 22 built-in APIs
6. Existing tests continue to pass — no regressions from the refactoring
7. Platform parity test suite has checks for all 5 anti-patterns — Unix commands in scripts, shebang-only files, hardcoded separators, unguarded chmod, exec with shell strings
8. When `rm -rf` is introduced in a package.json script — the platform parity test suite catches it before merge
9. When `execSync('cp ...')` is introduced in source code — the `no-unix-shell-command` ESLint rule catches it at authoring time

## Implementation Order

| Phase  | Description                                                         | Files Touched                                                                                                        |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **A1** | Create Node.js replacement scripts (`clean.mjs`, `copy-assets.mjs`) | New: `scripts/clean.mjs`, `packages/cli/scripts/copy-assets.mjs`                                                     |
| **A2** | Update all package.json scripts to use Node.js scripts              | `package.json` (root), `packages/cli/package.json`, `packages/core/package.json`, `packages/mcp-server/package.json` |
| **A3** | Fix `path-utils.ts` hardcoded separators                            | `packages/eslint-plugin/src/utils/path-utils.ts`                                                                     |
| **A4** | Guard `fs.chmodSync` with platform check                            | `packages/cli/src/commands/ci/init.ts`                                                                               |
| **B1** | Add `no-unix-shell-command` ESLint rule                             | New: `packages/eslint-plugin/src/rules/no-unix-shell-command.ts` + tests                                             |
| **B2** | Add `no-hardcoded-path-separator` ESLint rule                       | New: `packages/eslint-plugin/src/rules/no-hardcoded-path-separator.ts` + tests                                       |
| **B3** | Register new rules in plugin index and eslint config                | `packages/eslint-plugin/src/index.ts`, `eslint.config.js`                                                            |
| **B4** | Create root platform parity test suite                              | New: `tests/platform-parity.test.ts`                                                                                 |
| **C1** | Expand CI matrix to 3 OSes                                          | `.github/workflows/ci.yml`                                                                                           |
| **C2** | Verify full green on all 3 OSes, merge                              | —                                                                                                                    |

A phases (source fixes) and B phases (enforcement) are independent and can be developed concurrently. C phases depend on both A and B being complete.
