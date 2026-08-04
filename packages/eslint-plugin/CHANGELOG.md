# @harness-engineering/eslint-plugin

## 0.6.1

### Patch Changes

- 56dd525: feat(eslint-plugin): auto-generate the rule barrel from src/rules/

  `src/rules/index.ts` (the barrel that imports every rule and assembles the
  `rules` map) is now GENERATED from the rule files by
  `scripts/generate-rules-barrel.mjs` — a rule file's basename is its rule name and
  its default export is the rule, so registration is fully derivable. The generator
  is chained into `build`, `test`, and `typecheck`, so the barrel is always fresh;
  `generate:rules:check` guards freshness in CI.

  Adding a rule is now a single self-contained file drop in `src/rules/` — no
  hand-edit of the barrel, and no count to bump (the integration test asserts the
  barrel registers exactly the files on disk, a filesystem invariant rather than a
  hardcoded roster). This removes the precise multi-site barrel edit (import +
  object entry, correct placement, no dupes) that is the most error-prone step in
  adding a rule — especially for automated/local-model contributors. Preset
  membership (recommended/strict) remains an explicit, curated choice in
  `src/index.ts`.

## 0.6.0

### Minor Changes

- 0cb1c6d: feat(eslint-plugin): add `no-spread-in-variadic` rule (roadmap #220)

  Flags `Math.min(...arr)` / `Math.max(...arr)`. Spreading an array pushes every element
  onto the call stack as a separate argument, so a large array (~65k+ elements on V8) throws
  `RangeError: Maximum call stack size exceeded` — an input-dependent runtime crash the type
  checker cannot catch. A `reduce`/loop is bounded and safe. The rule reports only a spread
  argument to a non-computed `Math.min`/`Math.max` callee; plain args, other Math methods,
  array/object spread, and spread into non-Math callees are left alone. Enabled as `error`
  in the recommended and strict configs.

## 0.5.0

### Minor Changes

- 4c1385f: Add the `no-empty-describe` rule: flags `describe(...)` blocks whose callback
  body has no statements, so an empty test container can't slip into the suite
  and read as passing coverage. Object-name-gated on the `describe` identifier.
- 938ba6f: Add the `no-focused-tests` rule: flags focused tests — `describe.only` /
  `it.only` / `test.only`, and bare `fdescribe` / `fit` — so a focused test can't
  slip into CI and silently skip the rest of the suite. Object-name-gated, so an
  unrelated `.only` member access is not a false positive. Enabled as `error` in
  the recommended config.
- 89aaffc: Add the `no-hardcoded-test-count` ESLint rule. It flags hardcoded numeric literals in test-count
  assertions — `expect(x).toHaveLength(<number>)` and `expect(x.length).toBe(<number>)` — which drift
  silently as items are added or removed. A variable or computed expected value is not reported. The
  rule is registered in the recommended config.
- fac4261: feat(eslint-plugin): add `no-undefined-optional-assignment` rule

  Flags an object-literal property whose value is a variable declared `T | undefined` assigned
  directly (e.g. `{ field: maybeUndefined }`), which breaks `exactOptionalPropertyTypes`, and points
  at the conditional-spread form `...(value !== undefined && { field: value })`. Sound + syntactic
  (keys off the DECLARED annotation, since this plugin's RuleTester runs without type info): it flags
  `let x: T | undefined; { field: x }` and typed `T | undefined` params, exempts the already-guarded
  `(x !== undefined && { field: x })` form, and stays silent when the annotation is absent
  (unknown ⇒ no false positive).

  Authored as the human-review completion of an autonomous local-model draft (the model produced a
  plausible type-aware attempt that didn't fit this repo's syntactic-only test infra and failed
  typecheck).

- b7d55ee: Add the `no-skipped-tests` ESLint rule, flagging `.skip` and `x`-prefixed (xit/xdescribe/xtest) tests.

### Patch Changes

- af503e4: Add explicit type annotations to the `plugin`, `configs`, and `rules` exports so their inferred types are nameable via the direct `@typescript-eslint/utils` dependency rather than a hoisted `.pnpm` path (fixes TS2742 in the DTS build). Behavior-preserving.
- 0237a85: Add new ESLint rule `no-disabled-tests` that flags disabled/skipped tests left in source code including `it.skip(...)`, `test.skip(...)`, `describe.skip(...)`, and the bare `xit(...)` / `xdescribe(...)` / `xtest(...)` aliases.

## 0.4.0

### Minor Changes

- d577988: feat(eslint-plugin): add `no-undefined-optional-assignment` rule

  Flags an object-literal property whose value is a variable declared `T | undefined` assigned
  directly (e.g. `{ field: maybeUndefined }`), which breaks `exactOptionalPropertyTypes`, and points
  at the conditional-spread form `...(value !== undefined && { field: value })`. Sound + syntactic
  (keys off the DECLARED annotation, since this plugin's RuleTester runs without type info): it flags
  `let x: T | undefined; { field: x }` and typed `T | undefined` params, exempts the already-guarded
  `(x !== undefined && { field: x })` form, and stays silent when the annotation is absent
  (unknown ⇒ no false positive).

  Authored as the human-review completion of an autonomous local-model draft (the model produced a
  plausible type-aware attempt that didn't fit this repo's syntactic-only test infra and failed
  typecheck).

## 0.3.1

### Patch Changes

- e9f872c: Use the project root (the directory of `harness.config.json`) as the
  path-normalization anchor for `no-forbidden-imports` and
  `no-layer-violation`. Previously, both rules anchored to `/src/`, which
  collapsed `<monorepo>/packages/<x>/src/foo.ts` to `src/foo.ts` and destroyed
  the package prefix — making layer-based rules with `from: "packages/<x>/**"`
  patterns unable to match files inside `<package>/src/**`.

  `normalizePath` and `resolveImportPath` now accept an optional `projectRoot`
  parameter. When provided and the file lives under the root, the
  project-root-relative path is returned (preserving package identity).
  Otherwise the existing `/src/` heuristic is used unchanged, so
  single-package projects and any direct callers of the utilities are
  unaffected. A new `getConfigRoot(filePath)` helper in `config-loader`
  resolves the anchor from the nearest ancestor `harness.config.json`.

## 0.3.0

### Minor Changes

- f62d6ab: Add `no-process-env-in-spawn` ESLint rule and fix env leak in chat-proxy
  - New rule detects `process.env` passed directly to child process spawn calls, preventing environment variable leaks
  - Fix env leak in orchestrator chat-proxy identified by the new rule

### Patch Changes

- f62d6ab: Fix Math.random ID generation security vulnerability and API doc version drift
- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6

## 0.2.4

### Patch Changes

- Reduce Tier 2 structural violations and fix exactOptionalPropertyTypes errors

## 0.2.3

### Patch Changes

- Reduce cyclomatic complexity across rule implementations

## 0.2.2

### Patch Changes

- **New rule: `require-path-normalization`** — Requires path normalization for cross-platform compatibility. Detects raw `path.join()` and `path.resolve()` outputs used directly in comparisons or object keys without normalization.
- **README updated** — Added Cross-Platform Rules section documenting `no-unix-shell-command`, `no-hardcoded-path-separator`, and `require-path-normalization`.

## 0.2.1

### Patch Changes

- # Orchestrator Release & Workspace Hardening

  ## New Features
  - **Orchestrator Daemon**: Implemented a long-lived daemon for autonomous agent lifecycle management.
    - Pure state machine core for deterministic dispatch and reconciliation.
    - Multi-tracker support (Roadmap adapter implemented).
    - Isolated per-issue workspaces with deterministic path resolution.
    - Ink-based TUI and HTTP API for real-time observability.
  - **Harness Docs Pipeline**: Sequential pipeline for documentation health (drift detection, coverage audit, and auto-alignment).

  ## Improvements
  - **Documentation Coverage**: Increased project-wide documentation coverage to **84%**.
    - Comprehensive JSDoc/TSDoc for core APIs.
    - New Orchestrator Guide and API Reference.
    - Unified Source Map reference for all packages.
  - **Workspace Stability**: Resolved all pending lint errors and type mismatches in core packages.
  - **Graceful Shutdown**: Added signal handling and centralized resource cleanup for the orchestrator daemon.
  - **Hardened Security**: Restricted orchestrator HTTP API to localhost.

## 0.1.2

### Patch Changes

- Align dependency versions across workspace: `@types/node` ^22, `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3

## 0.1.1

### Patch Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.
