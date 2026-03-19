# Delta: Performance Enforcement (Part 1 — Entropy Extensions)

## Changes to EntropyConfig (packages/core/src/entropy/types.ts)

- [ADDED] `analyze.complexity` — ComplexityConfig for structural complexity thresholds
- [ADDED] `analyze.coupling` — CouplingConfig for coupling metric thresholds
- [ADDED] `analyze.sizeBudget` — SizeBudgetConfig for build size budgets

## Changes to EntropyReport (packages/core/src/entropy/types.ts)

- [ADDED] `complexity?: ComplexityReport` — structural complexity results
- [ADDED] `coupling?: CouplingReport` — coupling metric results
- [ADDED] `sizeBudget?: SizeBudgetReport` — size budget results

## Changes to AnalysisError (packages/core/src/entropy/types.ts)

- [MODIFIED] `analyzer` union type now includes `'complexity' | 'coupling' | 'sizeBudget'`

## Changes to EntropyAnalyzer (packages/core/src/entropy/analyzer.ts)

- [MODIFIED] `analyze()` accepts new `graphComplexityData` and `graphCouplingData` in graphOptions
- [MODIFIED] `analyze()` runs complexity, coupling, and size-budget detectors when configured
- [MODIFIED] Summary totals include new detector results

## Changes to CICheckName (packages/types/src/index.ts)

- [ADDED] `'perf'` check name to the union type

## Changes to Check Orchestrator (packages/core/src/ci/check-orchestrator.ts)

- [ADDED] `'perf'` case in `runSingleCheck` running complexity + coupling checks
- [MODIFIED] `ALL_CHECKS` array includes `'perf'`

## Changes to CodeIngestor (packages/graph/src/ingest/CodeIngestor.ts)

- [MODIFIED] Function and method nodes now include `cyclomaticComplexity`, `nestingDepth`, `lineCount`, and `parameterCount` in metadata

## Changes to Graph Exports (packages/graph/src/index.ts)

- [ADDED] `GraphComplexityAdapter` export
- [ADDED] `GraphCouplingAdapter` export

## Changes to MCP Server (packages/mcp-server/src/server.ts)

- [ADDED] `check_performance` tool definition and handler

## Changes to CLI (packages/cli/src/index.ts)

- [ADDED] `harness check-perf` command with `--structural`, `--coupling`, `--size` flags

## Changes to harness.config.json

- [ADDED] `performance` section with complexity, coupling, and sizeBudget defaults

---

# Delta: Performance Enforcement (Part 2 — Runtime, Skills, Persona)

## New Module: packages/core/src/performance/

- [ADDED] `types.ts` — BenchmarkResult, Baseline, BaselinesFile, RegressionResult, RegressionReport, CriticalPathEntry, CriticalPathSet
- [ADDED] `baseline-manager.ts` — BaselineManager class for .harness/perf/baselines.json persistence
- [ADDED] `regression-detector.ts` — RegressionDetector class for benchmark regression analysis
- [ADDED] `critical-path.ts` — CriticalPathResolver class for @perf-critical annotations + graph inference
- [ADDED] `index.ts` — barrel export

## Changes to Core Exports (packages/core/src/index.ts)

- [ADDED] `export * from './performance'` — re-exports entire performance module

## New Persona: agents/personas/performance-guardian.yaml

- [ADDED] v1 persona with harness-perf + harness-tdd skills, triggers on PRs and weekly schedule

## Modified Personas

- [MODIFIED] `code-reviewer.yaml` — added `check-perf` step on PR
- [MODIFIED] `codebase-health-analyst.yaml` — added `harness-perf` skill and `check-perf` command

## New Skills

- [ADDED] `agents/skills/claude-code/harness-perf/` — rigid skill with analyze/benchmark/report/enforce phases
- [ADDED] `agents/skills/claude-code/harness-perf-tdd/` — rigid skill extending TDD with benchmark assertions
- [ADDED] `agents/skills/gemini-cli/harness-perf/` — Gemini CLI parity
- [ADDED] `agents/skills/gemini-cli/harness-perf-tdd/` — Gemini CLI parity

## New MCP Tools (packages/mcp-server/src/tools/performance.ts)

- [ADDED] `get_perf_baselines` — read current baselines
- [ADDED] `update_perf_baselines` — save benchmark results as baselines
- [ADDED] `get_critical_paths` — list resolved critical path set

## New CLI Commands (packages/cli/src/commands/perf.ts)

- [ADDED] `harness perf bench [glob]` — run benchmarks
- [ADDED] `harness perf baselines show` — display baselines
- [ADDED] `harness perf baselines update` — update baselines
- [ADDED] `harness perf report` — full performance report
- [ADDED] `harness perf critical-paths` — show critical path set
