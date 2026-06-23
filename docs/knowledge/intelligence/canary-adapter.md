---
type: business_concept
domain: intelligence
tags:
  [intelligence, adapter, canary, test-automation, graceful-degradation, optional-dependency, mcp]
---

# Canary Adapter

The canary adapter (`packages/intelligence/src/adapters/canary.ts`) is a total, gracefully-degrading boundary around the deterministic [canary](https://github.com/bop-clocktower/canary) test CLI (`canary-test-cli`, an `optionalDependency`). It is the reference implementation of the pattern in ADR-0039: external tools from a foreign ecosystem are integrated as an optional adapter that never throws on absence.

## Surface

`createCanaryAdapter(exec?)` returns an adapter with three total methods:

- `probe()` → `{ status: 'available' | 'degraded', version?, reason? }`. Classifies absence as `not-installed` (ENOENT), `binary-missing` (launcher present but the native binary was never downloaded — postinstall skipped, offline, or unsupported platform), `exec-failed`, or `bad-output`.
- `recommendFramework(prompt)` → zod-validated `FrameworkRecommendation` (`canary recommend --json`); a `degraded` sentinel when unavailable.
- `reviewTest(path, framework?)` → zod-validated `CanaryFinding[]` (`canary review-test --json`); `[]` when unavailable.

The process-spawning seam (`CanaryExec`) is injectable so the degradation taxonomy is unit-testable without the real CLI. `execFile` is called with an args array (no shell interpolation) and bounded by a timeout so a hung CLI degrades rather than blocking.

## Two surfaces, deliberately separated

canary exposes a **deterministic CLI** (`recommend`, `review-test`, no API key) and a set of **generative Claude Code plugin skills** (`canary:canary-write-test`, `canary:canary-review-test`, `canary:canary-pick-framework`). The adapter wraps only the deterministic CLI. Test generation and generative critique stay on the plugin-dispatch path. canary's static `review-test` overlaps harness's own linters, so it is intentionally **not** wired into the Coverage Audit (D8).

## How skills reach it

Markdown skills cannot import the adapter, so it is exposed via two MCP tools in the CLI — `canary_probe` and `canary_recommend_framework`. The `harness-test-advisor` Coverage Audit calls `canary_probe` first (Audit Phase 0) and degrades with an install nudge when canary is absent, then uses `canary_recommend_framework` for deterministic framework selection on uncovered files.

## Related

- ADR-0039 — the cross-ecosystem optional-adapter pattern this implements.
- [[failure-modes]] — the broader intelligence-layer graceful-degradation philosophy.
