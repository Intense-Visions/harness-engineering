# @harness-engineering/linter-gen

## 0.1.8

### Patch Changes

- 50f1f47: Clear the 34 active dependency advisories that had been failing the blocking
  `Reconcile audit exceptions` check on every PR since 2026-10-05, and cover the two
  that have no upstream patch with a time-boxed register.

  `pnpm audit` goes from **34 active advisory entries (31 distinct GHSA ids) to 2** — all four
  criticals and ten of eleven highs clear.

  Twelve `pnpm.overrides` floors raised or added: `@grpc/grpc-js` (^1.14.5), `ip-address`
  (>=10.7.1), `fast-uri` (>=3.1.8 <4), `undici` (^7.29.1), `shell-quote` (^1.11.0),
  `brace-expansion@2` (>=2.1.7 <3), `brace-expansion@5` (>=5.0.12 <6), plus new floors for
  `proxy-addr` (>=2.0.8), `source-map-js` (>=1.2.2), `postcss-selector-parser` (>=7.1.6) and
  `@vue/server-renderer` + `vue` (both >=3.5.42, floored together so the runtime and its
  server-renderer cannot skew). Two direct dependency ranges move with them: `handlebars`
  ^4.7.9 → ^4.7.10 (`cli`, `linter-gen`) and `@modelcontextprotocol/sdk` ^1.29.0 → ^1.31.0
  (`cli`, `orchestrator`).

  Note on the mechanism, because it is not what it looks like: **every one of the seven existing
  floors already permitted its patched version.** They sat below it because these are transitives
  declared in no workspace manifest, so `pnpm update` has no dependency spec to advance and only an
  edit to the override _string_ moves them. Filed separately as the reason this recurs.

  Two advisories cannot be cleared at all — `braces` (GHSA-vfj7-8cjw-p6xm) and `sprintf-js`
  (GHSA-hp3w-g68c-fv3c) both report `patched_versions: "<0.0.0"`, so no patched release exists.
  They are covered by a deliberately narrow two-entry `auditExceptions` register with a
  per-advisory justification and a dated `expires`, not by a blanket exemption.

## 0.1.7

### Patch Changes

- f62d6ab: Resolve recurring release and CI workflow failures including V8 coverage race and Windows perf timeout
- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6

## 0.1.6

### Patch Changes

- Reduce Tier 2 structural violations and fix exactOptionalPropertyTypes errors

## 0.1.5

### Patch Changes

- Fix context-builder import path

## 0.1.4

### Patch Changes

- Reduce cyclomatic complexity in generator orchestrator

## 0.1.3

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

## 0.1.1

### Patch Changes

- Align dependency versions across workspace: `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3
