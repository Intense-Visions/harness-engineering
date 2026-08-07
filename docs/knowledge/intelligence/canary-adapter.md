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
- `readRunHistory(opts?)` → zod-validated `CanaryRunRecord[]` read from canary's documented NDJSON store (`test-results/reports/history-v2.jsonl`) under `opts.cwd`; `[]` when the file is missing, unreadable, or every line is malformed (a single bad line is dropped, valid records kept). Optional `opts.limit` caps the most-recent records returned.

The adapter has **two injectable acquisition seams**: the process-spawning `CanaryExec` (for the `--json` CLI subcommands above) and a file-reading `CanaryReader` (for `readRunHistory`). Both keep the degradation taxonomy unit-testable without a real canary install. `execFile` is called with an args array (no shell interpolation) and bounded by a timeout so a hung CLI degrades rather than blocking. Reading the documented on-disk artifact — rather than execing a (non-existent) history CLI verb — is the acquisition choice recorded in ADR-0086, which extends the ADR-0039 boundary from "exec-only" to "exec or documented-artifact read".

Run history is consumed downstream by the knowledge graph (`CanaryResultsIngestor` writes `test_result` nodes + `tested_by`/`failed_in` edges) and by outcome-eval (a canary run's gate exit code + pass/fail/flaky counts fold into the verdict rationale and the `execution_outcome` node metadata). The graph package never imports canary — the CLI layer reads via this adapter and passes plain records in.

## Two surfaces, deliberately separated

canary exposes a **deterministic CLI** (`recommend`, `review-test`, no API key) and a set of **generative Claude Code plugin skills** (`canary:canary-write-test`, `canary:canary-review-test`, `canary:canary-pick-framework`). The adapter wraps only the deterministic CLI. Test generation and generative critique stay on the plugin-dispatch path. canary's static `review-test` overlaps harness's own linters, so it is intentionally **not** wired into the Coverage Audit (D8).

## How skills reach it

Markdown skills cannot import the adapter, so it is exposed via two MCP tools in the CLI — `canary_probe` and `canary_recommend_framework`. The `harness-test-advisor` Coverage Audit calls `canary_probe` first (Audit Phase 0) and degrades with an install nudge when canary is absent, then uses `canary_recommend_framework` for deterministic framework selection on uncovered files.

## Related

- ADR-0039 — the cross-ecosystem optional-adapter pattern this implements.
- [[failure-modes]] — the broader intelligence-layer graceful-degradation philosophy.
