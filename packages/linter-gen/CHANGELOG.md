# @harness-engineering/linter-gen

## 0.2.0

### Minor Changes

- a6f5f19: Move every package from `zod ^3.25.76` to `zod ^4.6.6` for GHSA-mrhx-c7xc-m3w5
  (high: zod can exhaust memory while validating oversized constrained collections).
  The advisory covers every `zod < 4.6.6` and no patched 3.x exists, so this is a major
  upgrade of the validator rather than a floor bump. Root `pnpm.overrides` gains
  `"zod": ">=4.6.6 <5"` so transitive dependents (`@mistralai/mistralai`, the MCP SDK,
  `openai`, `@anthropic-ai/sdk`) resolve the same patched copy; the lockfile has no
  `zod@3` left. `@asteasolutions/zod-to-openapi` moves `^7.3.0` -> `^8.5.0` (its zod 4
  line); `docs/api/openapi.yaml` regenerates byte-identical.

  **Silent allowance bug this exposed.** In zod 4 an enum-keyed `z.record` is
  exhaustive. `ArchAllowanceSchema.categories` used one, so an allowance listing only the
  categories it acknowledges (the normal case) failed `safeParse`, and
  `loadArchAllowances` skipped it without a word — the acknowledged regression stopped
  counting. Every enum-keyed record (allowance categories, baseline/timeline metrics,
  threshold config, trend/prediction categories and deltas, the routing
  `complexityTierMatrix`, the GitHub tracker `statusMap`) is now `z.partialRecord`, which
  is what zod 3 did at runtime and what their inferred types already said.

  Other zod 4 semantics ported rather than shimmed (no `zod/v3` imports):
  - Object `.default({})` / array-of-object defaults that relied on zod 3 parsing the
    default through the inner schema are now `.prefault()`, so nested defaults still fill.
  - `skillHooks` stays `undefined` when absent (zod 4 applies an inner `.default()` even
    under `.optional()`).
  - The JSON-schema converter used by the analysis providers and the
    `harness.config.json` stripped-key walker read zod 3 internals (`_def.typeName`);
    under zod 4 they would have emitted `{}` / reported no dropped keys. Both are ported
    to `_zod.def`, and the converter gains tests.
  - `validateConfig` no longer misreports a missing field as a type mismatch (zod 4
    dropped `received` from `invalid_type` issues).
  - Single-argument `z.record(v)` -> `z.record(z.string(), v)`; `errorMap` -> `error`.

  Bump level is `minor`: these packages export zod schemas, and a consumer that composes
  them with its own zod 3 instance will not interoperate. User-visible validation
  messages also change wording (e.g. "Invalid input: expected number, received string").

### Patch Changes

- ed36a56: Align declared `minimatch` (`^11.0.4`) and `glob` (`^14.0.3`) ranges with the versions the root `pnpm.overrides` already resolve, so the published manifests no longer advertise the vulnerable `minimatch@10` / `glob@13` ranges that Dependabot alerts on. Resolved versions are unchanged (minimatch 11.0.4, glob 14.0.3).

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
