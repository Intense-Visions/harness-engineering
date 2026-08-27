# Plan: Answer-quality axis for `harness graph bench`

> Spec: [`../proposal.md`](../proposal.md). Issue #1271 (deferred slice). `Refs #1271`.

## Task breakdown

### T1 — Judge module (`packages/cli/src/commands/graph/bench-judge.ts`)

- Define `QualityGrade` (`sufficient: boolean | null`, `confidence`, `rationale`),
  `BenchJudge` interface (`grade(query, strategy, payloadText) => Promise<QualityGrade>`).
- `qualityVerdictSchema` (zod `.strict()`: `{ sufficient, confidence, rationale }`) — the
  LLM never returns authority/score; sufficiency is derived by us.
- `buildBenchJudge(provider, model?)`: wraps `AnalysisProvider.analyze<T>()`, truncates
  payload to `JUDGE_PAYLOAD_CHAR_BUDGET`, strict re-parses, and degrades any failure to an
  inconclusive grade (`sufficient: null`). Mirrors `OutcomeEvaluator.judge()`.
- `resolveBenchJudge(model?)`: `resolveAnalysisProvider(model)` → `buildBenchJudge` or
  `null` when no provider. Reuses the shared eval resolver (decision #1).

### T2 — Wire the judge into `runGraphBench` (`bench.ts`)

- Add `query: string` to `ScenarioResult`; compute a deterministic query per family
  (`benchQueryFor(family, anchor)`).
- Capture `graphText` / `naiveText` payloads alongside metrics (naive text = concatenated
  file contents) so the judge can grade them.
- Add `GraphBenchOptions.judge?: BenchJudge`. After scenarios are built, if a judge is
  present, grade each scenario × strategy and attach `quality`.
- Add `answerQuality` to `GraphBenchResult`: `{ status: 'skipped'|'inconclusive'|'measured',
advisory: true, note, graph?/naive?: { sufficient, inconclusive, total, sufficientRate } }`.
  Status rules per proposal. Never touches `result.ok`.

### T3 — Output + CLI flag

- `formatBenchReport`: add an answer-quality section (status; when measured, graph vs
  naive sufficiency rate). Keep the existing deferred-slice line accurate by status.
- `createBenchCommand`: add `--judge` and `--judge-model <model>`. When `--judge`, call
  `resolveBenchJudge(model)`; a null resolver yields `status: 'inconclusive'`.

### T4 — Tests (`bench.test.ts`, `bench-judge.test.ts`)

- Mock-judge test: inject a `BenchJudge` stub → assert every scenario has a `quality`
  grade for both strategies, aggregate `answerQuality.status === 'measured'`, and
  sufficiency counts fold correctly.
- Degrade test: run with no judge → `status: 'skipped'`; run with a judge whose
  `analyze` rejects (via `buildBenchJudge` over a rejecting provider) → grade
  `sufficient: null` / aggregate `inconclusive`, `result.ok` still true.
- Query-derivation unit test for `benchQueryFor`.

### T5 — Docs + reference regen

- RESULTS.md caveat #1 + REPRODUCING.md deferred-slice bullet: describe the measurable
  axis and honest degradation.
- Document the new `answerQuality` / `quality` / `query` fields (results/latest.json
  schema note).
- `pnpm run generate-docs` to refresh `docs/reference/*` for the new flags.

### T6 — Provenance + gates

- `provenance.json` (issue 1271, stages, plan_path, `Refs #1271`, assumptions[]).
- Build CLI, run bench.test + bench-judge.test, typecheck, lint, format. Ship through
  pre-push gates (changeset, format:check, reference-docs freshness). No `--no-verify`.

## Ordering / dependencies

T1 → T2 → T3 (T3 depends on both). T4 after T2/T3. T5 after code stabilises. T6 last.

## Risk / mitigations

- **Payload size to judge**: bounded by a documented char budget constant; surfaced in the
  result note so the judgment is honest about what it saw.
- **Non-determinism in CI**: axis is opt-in and mock-injected in tests; no live judge call
  in CI. Default (`skipped`) path keeps objective axes byte-identical.
- **Reviewer WIRED-trace**: the query string + per-scenario grade in `--json` output let a
  reviewer trace bench → judge → score end to end from a live run.
