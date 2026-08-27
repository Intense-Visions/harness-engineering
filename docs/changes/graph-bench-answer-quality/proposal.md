# Proposal: Answer-quality axis for the graph token-savings benchmark

> Deferred slice of issue #1271. `Refs #1271`.

## Problem

`harness graph bench` (`packages/cli/src/commands/graph/bench.ts`, shipped in PR #1588)
measures **two** objective, deterministic axes for graph-scoped retrieval vs naive
file-by-file exploration:

1. **Tokens** — chars ÷ 4 of the text each strategy puts into context.
2. **Tool calls** — discrete retrieval calls each strategy makes.

The comparator (arXiv 2603.27277) reports a **third** axis — **answer quality (83%)**:
whether the retrieved context actually _suffices to answer_ the query. That axis was
deferred because it needs an LLM judge and is non-deterministic. Without it, the token
ratio is honestly labelled "cost to retrieve a scoped answer", not "cost to retrieve an
equally-complete answer" — a caveat RESULTS.md calls out explicitly. The number is
therefore incomplete: a reviewer cannot see whether the cheap graph payload actually
answers the question or just returns less.

## Goal

Add the answer-quality axis to `harness graph bench`: for each benchmark query, an LLM
**judge** grades whether each strategy's retrieved payload is _sufficient_ to answer the
query. Reuse the existing harness eval/judge plumbing rather than building a bespoke
judge. Degrade honestly when no judge is reachable. Wire it into the command output and
the published benchmark docs.

## Non-goals

- **Multi-repo corpus** (still deferred, `Refs #1271`).
- Making the quality axis a **blocking** gate — it is advisory, like `outcome_eval`'s
  low-confidence verdicts. The bench never fails because of it.
- Grading _correctness_ of an answer the agent would write. We grade whether the
  **retrieved payload contains enough** to answer — a retrieval-sufficiency judgment.

## Approach

### Reuse the eval/judge infrastructure

The harness already has a provider-neutral judge seam:

- `resolveAnalysisProvider(model?)` (`packages/cli/src/mcp/utils/analysis-provider.ts`)
  resolves a real `AnalysisProvider` with precedence **Anthropic key → local `/v1`
  endpoint (`HARNESS_ANALYSIS_BASE_URL`) → null**. This is the identical resolver
  `outcome_eval` / `acceptance_eval` use.
- `AnalysisProvider.analyze<T>({ prompt, systemPrompt, responseSchema, model })`
  (`@harness-engineering/intelligence`) returns a schema-validated structured verdict.

The new judge is a thin wrapper over that seam — no new provider, no new key plumbing.
It mirrors `OutcomeEvaluator.judge()`: strict-schema re-parse, and any provider
rejection / parse failure degrades to an **inconclusive** grade rather than throwing.

### The query per scenario

Each scenario already has an `anchor`. `find-context` and `ask` anchors are already
natural-language queries; the structural families (`impact`, `blast-radius`,
`dependencies`, `outline`) get a deterministic query phrasing derived from the family +
anchor (e.g. `"What is the blast radius of <file> — which files/symbols are affected?"`).
The query is stored on each `ScenarioResult` (new `query` field) so a reviewer can read
exactly what the judge was asked and the run is reproducible.

### The grade

For each scenario × strategy the judge answers: **is this retrieved payload sufficient to
answer the query?** → `{ sufficient: boolean, confidence, rationale }`. Payloads are
truncated to a bounded, documented character budget before judging (the naive payload is
whole files and can be ~900k tokens); the budget is a source constant and surfaced in the
result note so the judgment is honest about what it saw.

### Honest degradation (deterministic-friendly for CI)

The axis is **opt-in** via `--judge`. Its status in the result:

- `--judge` **absent** → `status: 'skipped'` (default; the two objective axes stand
  alone, exactly as today — byte-compatible for existing consumers except the additive
  `answerQuality` block).
- `--judge` present but **no provider** reachable/configured → `status: 'inconclusive'`,
  advisory, note explains no judge — **the benchmark still succeeds** with its token/
  tool-call axes.
- `--judge` present **with** a provider → `status: 'measured'`; individual scenarios whose
  grade call fails degrade to an inconclusive grade and are counted separately, never
  faking a score.

The axis is **always advisory**: it never changes `result.ok` and never fails the bench.
Tests inject a mock judge so the wiring (bench → judge → per-scenario grade → aggregate)
is exercised deterministically, and a no-judge path proves the INCONCLUSIVE degrade.

### Output + docs wiring

- `formatBenchReport` gains an answer-quality line/section (status + graph vs naive
  sufficiency rates when measured).
- `GraphBenchResult` gains `answerQuality` (aggregate) and each `ScenarioResult` gains an
  optional `quality` grade + the `query` string.
- `docs/benchmarks/graph-token-savings/` — RESULTS.md caveat #1 updated to describe the
  now-measurable axis, REPRODUCING.md deferred-slice bullet updated, and
  `results/latest.json` schema documented to carry the new fields.

## Acceptance criteria

1. Running `harness graph bench --judge` with a configured provider produces, in the live
   command output and the `--json` / `--out` result, a per-scenario `quality` grade for
   both strategies and an aggregate `answerQuality` block with `status: 'measured'` — a
   reviewer can trace **bench → judge → quality score** in the output.
2. Running `harness graph bench --judge` with **no** provider configured reports
   `answerQuality.status: 'inconclusive'` (advisory), does **not** fabricate a score, and
   the benchmark still exits 0 with its token/tool-call axes intact.
3. Running `harness graph bench` **without** `--judge` is behaviourally unchanged except
   for the additive `answerQuality: { status: 'skipped' }` block — the objective axes are
   byte-identical.
4. A test injects a mock judge and asserts the axis is computed per scenario and folds
   into the aggregate; a second test asserts the no-judge / unreachable path degrades to
   INCONCLUSIVE without throwing and without failing the bench.
5. The published benchmark docs (RESULTS.md, REPRODUCING.md, results/latest.json schema)
   reflect the new axis. `docs/reference/*` regenerated for the new CLI flags.
