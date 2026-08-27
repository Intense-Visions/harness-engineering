---
title: Reproducible graph token-savings benchmark
issue: 1271
status: approved
keywords:
  - code-graph
  - context-scoping
  - token-savings
  - benchmark
  - reproducibility
  - naive-baseline
  - tool-calls
---

# Reproducible graph token-savings benchmark

## Overview and goals

Harness ships code-graph context-scoping (`query_graph`, `ask_graph`, `get_impact`,
`compute_blast_radius`, `code_outline`, `find_context_for`) — the exact capability its two
closest competitors benchmark and market — but has never published a number for it. This
change adds a **re-runnable benchmark** that measures how much retrieval cost graph-scoped
tools save over the naive file-by-file exploration a graph-less agent is forced into, runs
it on this repo's own graph, and publishes both the methodology and the measured result.

**Goal:** one documented command reproduces a truthfully-reported token-savings and
tool-call-savings number for graph-scoped retrieval on this repository.

**Honest-number commitment:** the target we hold ourselves to is the arXiv comparator figure
(preprint 2603.27277: ~10x fewer tokens, ~2.1x fewer tool calls, 83% answer quality across 31
real repos) — **not** the flattering 99.2% README figure that came from 5 hand-picked
structural queries. We accept the risk the measured number may be unflattering: harness's graph
is multi-purpose (review scoping, impact, blast radius) where both comparators are
single-purpose and metric-optimized. A losing result is a roadmap input, not a reason to
suppress the measurement.

## Non-goals / out of scope

- **Answer-quality scoring (the "83%" axis).** Measuring answer quality requires an LLM judge
  grading whether each retrieval strategy's payload actually answers the question. That is a
  separate, non-deterministic slice. This change measures the two **objective, deterministic**
  axes — tokens and tool calls — and documents answer-quality as a deferred slice (`Refs #1271`).
- **A 31-repo cross-corpus comparison.** The harness lands here (runnable on this repo, with a
  documented methodology and a recorded number); broadening to a multi-repo corpus is a deferred
  slice noted in the methodology doc.
- **Re-running the competitors' own harnesses.** We measure harness against a naive baseline, not
  against `codebase-memory-mcp` or `code-review-graph` in-process.

## Decisions made

1. **Measure two objective axes only: tokens and tool calls.** Both are deterministic given a
   fixed graph, so the benchmark is reproducible. Answer quality is deferred (see Non-goals).
2. **Target the honest arXiv comparator figure and report truthfully.** The methodology doc
   states the comparator figure up front and reports the measured harness number against it,
   flattering or not.
3. **The naive baseline is filesystem discovery + full-file reads, using no graph.** It is the
   fair proxy for a graph-less agent: to answer "what depends on X" it must grep for the symbol
   and read every matching file in full, because it cannot scope within a file. Tokens are the
   sum of full file contents read; tool calls are `1 search + N reads`.
4. **The graph-scoped side invokes the real shipped MCP tool handlers.** The benchmark calls
   `handleGetImpact`, `handleComputeBlastRadius`, `handleQueryGraph`, `handleCodeOutline`,
   `handleFindContextFor`, and `handleAskGraph` directly — the same code paths an agent hits —
   and measures the tokens of the returned payload. This is dogfooding, not a re-implementation.
5. **Anchors are derived from the graph deterministically, not hand-picked.** Structural
   scenarios anchor on the top-N most-depended-upon file nodes (highest inbound degree), so the
   scenario set is reproducible and portable to other repos rather than a curated set of
   flattering queries.
6. **Identical token estimator on both sides.** Both sides use the `chars / 4` estimator that
   matches core's `estimateTokens`, applied to the exact text each strategy would put in the
   model's context, so the ratio is apples-to-apples.
7. **Wired through a live entry point.** A `harness graph bench` CLI subcommand runs the
   benchmark and prints the metrics; a root `pnpm run bench:graph-tokens` npm script aliases it.
   The methodology and the recorded result are committed under `docs/benchmarks/`.

## Technical design

### Scenario families (one per named graph tool)

| Family         | Graph tool (real handler)  | Anchor selection                  | Naive baseline (no graph)                                  |
| -------------- | -------------------------- | --------------------------------- | ---------------------------------------------------------- |
| `impact`       | `handleGetImpact`          | top-N inbound-degree file nodes   | grep symbol basename → read every matching file in full    |
| `blast-radius` | `handleComputeBlastRadius` | top-N inbound-degree file nodes   | grep symbol basename → read every matching file in full    |
| `dependencies` | `handleQueryGraph` depth 2 | top-N outbound-degree file nodes  | read the anchor file + every locally-imported file in full |
| `outline`      | `handleCodeOutline`        | top-N largest source files        | read the whole anchor file                                 |
| `find-context` | `handleFindContextFor`     | fixed generic developer intents   | keyword grep from intent → read top-K matching files       |
| `ask`          | `handleAskGraph`           | fixed generic developer questions | keyword grep from question → read top-K matching files     |

N defaults to 5 per structural family; the fixed intent/question lists are small (3–4 entries)
and live in the source so a reviewer can read exactly what was asked.

### Measurement

For every scenario the benchmark records, for each strategy: `tokens` (estimator over the exact
context text), `toolCalls`, and `bytes`. It aggregates per-family and overall:

- `tokenSavings = naiveTokens / graphTokens` (× fewer tokens)
- `toolCallSavings = naiveToolCalls / graphToolCalls` (× fewer calls)

### File layout

- `packages/cli/src/commands/graph/bench.ts` — `runGraphBench(projectPath, opts)`; scenario
  derivation, both strategies, aggregation, JSON result. Pure function returning a typed
  `GraphBenchResult`; no process side effects.
- `packages/cli/src/commands/graph/bench.test.ts` — behavior tests (deterministic on a small
  fixture graph; asserts both strategies run, tokens are counted on both sides, and the naive
  side reads strictly more than the graph side for structural families).
- `packages/cli/src/commands/graph/index.ts` — register `graph bench` subcommand (`--json`,
  `--out <path>`, `--top <n>`).
- Root `package.json` — `"bench:graph-tokens"` script.
- `docs/benchmarks/graph-token-savings/REPRODUCING.md` — methodology + exact command.
- `docs/benchmarks/graph-token-savings/RESULTS.md` — the recorded number on this repo.
- `docs/benchmarks/graph-token-savings/results/latest.json` — machine-readable result.

### Graph prerequisite

The benchmark loads the graph via the same `loadGraphStore` the tools use. If no graph is
present it emits a clear instruction to run `harness graph scan` first. The reproduce command in
the doc runs the scan then the bench.

## Integration Points

- **Entry Points** — new `harness graph bench` CLI subcommand; new root npm script
  `bench:graph-tokens`.
- **Registrations Required** — subcommand added to the `graph` command group in
  `commands/graph/index.ts`; `docs/reference/*` regenerated via `pnpm run generate-docs`. No new
  `@harness-engineering/core` export, so no barrel change.
- **Documentation Updates** — `docs/benchmarks/graph-token-savings/{REPRODUCING,RESULTS}.md`
  published; CLI reference docs regenerated.
- **Architectural Decisions** — None rise to a standalone ADR; this is an additive, read-only
  measurement command with no cross-cutting architecture change.
- **Knowledge Impact** — records the first published token-savings number for the code graph; the
  methodology becomes the citable source for the capability's marketing claim.

## Success criteria

1. `pnpm run bench:graph-tokens` (and `harness graph bench`) run to completion on this repo and
   print per-family and overall token-savings and tool-call-savings ratios.
2. The graph-scoped side invokes the real shipped tool handlers; the naive side uses only
   filesystem search + full-file reads.
3. A committed methodology doc lets a reader reproduce the number with one documented command,
   and a committed results doc records the measured number on this repo.
4. Both strategies are measured with the identical token estimator; the result JSON is written to
   `docs/benchmarks/graph-token-savings/results/latest.json`.
5. Answer-quality and multi-repo-corpus axes are explicitly documented as deferred slices.
6. `bench.test.ts` proves both strategies execute and that structural families read strictly more
   tokens naively than via the graph on a fixture.

## Implementation order

1. `runGraphBench` core (scenario derivation from graph, both strategies, aggregation) + tests.
2. Register `graph bench` subcommand; add root npm script.
3. Run on this repo; capture the number; write REPRODUCING.md + RESULTS.md + latest.json.
4. Regenerate reference docs; build CLI; verify pre-commit/pre-push gates; open PR.

## Assumptions made

- Token cost is faithfully proxied by `chars / 4` (core's `estimateTokens`); absolute tokens are
  approximate but the **ratio** between strategies is the reported result.
- A fair naive baseline reads whole files because a graph-less agent cannot scope within a file;
  this may understate naive cost (an agent often reads unrelated files too), so the reported
  savings is a conservative lower bound.
- Deriving anchors from graph degree is representative of real developer questions ("what depends
  on this heavily-used module?"); the fixed intent/question lists cover the task-context families.
