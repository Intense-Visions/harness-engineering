---
title: Implementation plan — Reproducible graph token-savings benchmark
issue: 1271
spec: docs/changes/graph-token-savings-benchmark/proposal.md
---

# Plan: Reproducible graph token-savings benchmark

Derived from `../proposal.md`. Phases map to the spec's Implementation Order.

## Phase 1 — Benchmark core + tests

- **T1.** Add `packages/cli/src/commands/graph/bench.ts` exporting `runGraphBench(projectPath, opts)`
  returning a typed `GraphBenchResult`. Responsibilities:
  - Load the graph via `loadGraphStore`; abstain with a clear message if absent.
  - Derive scenarios deterministically: structural families anchor on top-N file nodes ranked by
    neighbor degree; `find-context`/`ask` use fixed in-source intent/question lists.
  - Graph strategy: invoke the real handlers (`handleGetImpact`, `handleComputeBlastRadius`,
    `handleQueryGraph`, `handleCodeOutline`, `handleFindContextFor`, `handleAskGraph`); count
    tokens over returned text; `toolCalls = 1` per scenario.
  - Naive strategy: filesystem search + full-file reads (no graph); `toolCalls = 1 search + N reads`.
  - Identical `estimateTokens` (chars/4) both sides. Aggregate per-family + overall ratios.
- **T2.** Add `packages/cli/src/commands/graph/bench.test.ts` — deterministic on a small fixture
  graph: both strategies execute, tokens counted on both sides, structural naive tokens strictly
  exceed graph tokens. **Checkpoint:** `vitest run bench.test.ts` green.

## Phase 2 — Wiring (live entry point)

- **T3.** Register `graph bench` subcommand in `commands/graph/index.ts` with `--json`,
  `--out <path>`, `--top <n>`; human-readable table by default.
- **T4.** Add root `package.json` script `bench:graph-tokens` invoking the built CLI subcommand.
  **Checkpoint:** `harness graph bench` prints a metrics table on this repo.

## Phase 3 — Measure + publish

- **T5.** Run `harness graph scan` then `harness graph bench --out docs/benchmarks/.../results/latest.json`
  on this repo; capture the number.
- **T6.** Write `docs/benchmarks/graph-token-savings/REPRODUCING.md` (methodology + exact command,
  comparator context, deferred slices) and `RESULTS.md` (measured number). Commit `latest.json`.
  **Checkpoint:** one documented command reproduces the recorded number.

## Phase 4 — Gates

- **T7.** `pnpm run generate-docs` (CLI reference), build CLI, run pre-commit/pre-push gates, open PR.
  **Checkpoint:** all-OS CI green.

## Verification tiers

- **EXISTS:** files present; subcommand registered.
- **SUBSTANTIVE:** `bench.test.ts` proves both strategies run and the ratio is computed.
- **WIRED:** `pnpm run bench:graph-tokens` / `harness graph bench` runs end-to-end on this repo and
  writes `latest.json`; the published doc's command reproduces it.
