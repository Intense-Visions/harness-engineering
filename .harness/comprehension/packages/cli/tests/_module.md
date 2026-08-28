---
schemaVersion: 1
module: 'packages/cli/tests'
sourceHash: '6949650ff62c853b1430ba17d2e725360c3f141c93c85f7030eb16dcc41761ad'
compiledAt: '2026-08-28T01:22:09.482Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['setup.ts']
---

## Summary

**packages/cli/tests** is the CLI package's comprehensive test suite with 524 test files across 39 directories, organized by feature domain (commands: 143 tests, templates: 10, integration: 11, hooks: 23, shared: 5, and many others). Tests run under Vitest with a global setup that enforces mock-LLM behavior by default and disables telemetry to prevent background fetch-call races. Command tests and integration tests spawn the built CLI as a subprocess, requiring an extended 90-second timeout under the pre-push gate's compound coverage load. Fixtures provide reproducible project states (valid, invalid, and edge-case scenarios) for consistent test isolation. Tests cover three tiers: unit tests for individual modules, integration tests for cross-subsystem scenarios, and CLI command tests that exercise the full CLI end-to-end. The suite detects coverage mode via `HARNESS_COVERAGE` env var so timing-sensitive tests can relax budget under instrumentation.

## Invariants

- HARNESS_CRAFT_LLM=mock default: Global setup forces mock-LLM mode; tests that need production defaults must explicitly override it in their own beforeEach. Prevents flaky real LLM calls and enables deterministic behavior across all craft-skill tests.
- DO_NOT_TRACK=1 prevents fetch-spy pollution: Tests disable telemetry export via the standard opt-out; without this, OTLP exporter background fetch() calls race with and corrupt the fetch spies that gateway, delivery, and MCP tests rely on, causing load-dependent flakiness.
- testTimeout: 90s for subprocess spawning: 37 test files spawn node/git subprocesses. Under v8 coverage + parallel execution + turbo's dual-package concurrency, cold-start starvation is real; the 90s timeout is load-dependent, not a correctness gate (CI runs the full authoritative suite without this constraint).
- CLI tests require rebuilt dist/: Integration and command tests spawn dist/bin/harness.js; source changes do not auto-update the bundle. Tests must run after turbo build or use pnpm run build-release.
- Fixtures are canonical test state: Each fixture is a frozen, reproducible project state (valid-project for happy path, security-findings for vulns, deps-\*-cycle for architectural violations). Modifying fixtures mid-suite breaks downstream tests expecting stable state.
- v8 coverage mode is detectable: Tests can read HARNESS_COVERAGE env var to relax timing budgets under instrumentation; this allows the same suite to pass both fast CI runs and slow coverage runs.

## Interface Contract

```ts

```

## Dependency Slice

```

```
