# Consume canary structured test results into graph / outcome-eval / pulse

**Keywords:** canary-adapter, test-results, history-jsonl, knowledge-graph, test_result-node, outcome-eval, execution_outcome, gate-exit-code, pulse-trends, graceful-degradation

## Overview & Goals

Harness already ships a one-way harness→canary bridge (`canary_probe`,
`canary_recommend_framework`, and — in a sibling effort — `canary_discover_test_command`).
The reverse direction, where canary's **structured** run outputs feed harness intelligence,
is missing. This feature wires canary's persisted run history into harness consumers:

1. **Knowledge graph** (this PR) — ingest runs/tests as `test_result` nodes + edges (test→file, failure/flaky signals).
2. **outcome-eval** (this PR) — map a canary run's structured outcome (pass/fail/flaky + gate exit code) into the `execution_outcome` node the outcome-eval judge produces.
3. **pulse** (phased to a follow-on — see D5) — feed flaky-rate / failure-category trends into the pulse signal surface.

The acquisition foundation (adapter + MCP tool) plus the graph and outcome-eval
consumers ship in this PR; pulse is phased out with a retained design sketch (D5)
because it demands a materially larger cross-layer contract change (see below).

**Non-goals / YAGNI:** no vendoring of canary data; no reinvention of the adapter
boundary; no new graph schema types (`test_result`/`execution_outcome` nodes and
`tested_by`/`failed_in`/`outcome_of` edges already exist); no coupling to canary's
remote Supabase store (local NDJSON only in v1); no per-test OTel trace ingestion
(canary-instrument `run.json`) in v1 — that is a distinct producer.

Every consumer degrades gracefully: when canary is absent or has produced no
results, each path returns today's behavior (empty ingest / unchanged verdict /
skipped pulse source) — never a hard failure.

## Decisions made

### D1 — Acquisition mechanism: read the documented NDJSON store (FLAGGED)

Canary persists run history as **NDJSON, one `RunRecord` per line**, at
`test-results/reports/history-v2.jsonl` (documented, stable path; `RunRecord`
shape in canary `ts/src/history/record.ts`). The adapter reads this file directly
through a new **injectable file-read seam** confined to the CanaryAdapter module,
zod-validates each line, and degrades to `[]` on any failure (missing file,
unreadable, malformed lines).

Rejected: **exec a JSON-emitting `canary history` subcommand.** Canary's documented
CLI surface (`init`, `setup`, `run`, `frameworks`, `recommend`, `migrate`,
`heal-test`, `flake-check`, `review-test`, `feedback`, `ticket-update`, `doctor`,
`overlay`, `upgrade`, `version`) exposes **no** stable history/timeline query that
emits run records as JSON — timeline querying lives in an internal module
(`ts/src/history/cli.ts`), not a contracted CLI verb. Reading the documented store
is the stable contract; execing a non-existent verb is not.

**Why this still honors ADR-0039 and the #913/#1184 seam:** the boundary's invariant
is that *all canary coupling* is confined to one module, zod-validated, and totally
degrading — not that coupling must be `execFile`. We add a `read` seam beside the
existing `exec` seam, both injectable, both classified into the degrade taxonomy.
The seam shape is unchanged: **one total adapter method + one thin MCP tool per
capability.** This is FLAGGED per the mandate as the load-bearing acquisition choice.

### D2 — Seam shape: one adapter method + one MCP tool

Add `CanaryAdapter.readRunHistory(opts?)` returning `CanaryRunRecord[]` (empty when
degraded), plus a thin MCP tool `canary_run_history`. Mirrors the sibling wiring's
`listFrameworks()` + `canary_discover_test_command` exactly. Skills/consumers reach
canary only through this tool — never a direct file read.

### D3 — Graph ingest: reuse existing node/edge types, no schema bump

A new `CanaryResultsIngestor` (mirroring `CIConnector`'s node-writing shape) turns each
`RunRecord` into a `test_result` node (per run) and its embedded `TestResult[]` into
per-test `test_result` nodes, carrying `status`/`failure_category`/`retry_count`/
`flaky` in metadata. Edges: per-test `test_result --tested_by--> file` when the
`test_file` resolves to a known `file`/`module` node; failing tests get
`--failed_in-->` the run node. Reuses the existing `test_result` node type and
`tested_by`/`failed_in` edges — **no `NODE_TYPES`/`EDGE_TYPES` change**, so no graph
schema-version bump (avoids the known rebuild/commit-hang hazard). Wired into
`ingest_source` behind a new `source` enum value `test-results`.

### D4 — outcome-eval: additive structured input (mirrors the guardian pattern)

Extend `OutcomeEvalInput` with an optional `canaryRun?` field carrying the run's
structured outcome (gate `exitCode` 0/1/2/3, `passed`/`failed`/`flaky`/`skipped`
counts). When present, a deterministic one-line signal is folded into the verdict
rationale and the structured outcome is stamped onto the `execution_outcome` node's
additive metadata (`canaryGateExitCode`, `canaryFlaky`, etc.). **Never** affects the
TS-derived ship authority. Absent/empty leaves the verdict byte-identical to no
canary wiring — exactly the additive contract the `guardian?` field (#914) established.

### D5 — pulse: DEFERRED to a follow-on phase (justified)

Feeding flaky-rate / failure-category trends into pulse requires extending the
cross-layer pulse contract — a new `PulseSourceKind`/`PulseSources` slot in
`@harness-engineering/types`, the core `PulseConfigSchema`, the sanitize PII
boundary, the config writer, and the adapter registry. That is a materially larger
and more invasive surface than graph/outcome-eval, for lower marginal value, and it
would balloon this PR past a reviewable size. It is **phased out**, not abandoned:
the design sketch is retained below and tracked for a follow-on. Shipping the
acquisition foundation (D1/D2) makes the pulse phase a thin adapter over
`readRunHistory` later.

## Assumptions

- **Runtime:** Node.js (the adapter uses `node:fs/promises` for the read seam; the exec seam already assumes Node).
- **Store location:** canary writes its history to `test-results/reports/history-v2.jsonl` relative to the project root (`cwd`); the adapter resolves it under a caller-supplied or default `cwd`. A remote Supabase store is out of scope (v1 reads local NDJSON only).
- **File size:** the history file is bounded enough to read into memory in v1; an optional `limit` caps how many of the most-recent records are returned. Streaming is a future optimization, not a v1 requirement.
- **Schema drift:** records carry no per-record `schema_version` (v2 lives in the filename); the adapter parses permissively and drops only individual malformed lines.

## Technical design

### Adapter (`packages/intelligence/src/adapters/canary.ts`)

- `CanaryReader` injectable seam: `(filePath: string) => Promise<string>` (default: `fs.readFile` utf8). Parallels the existing `CanaryExec` seam.
- Zod schemas `canaryRunRecordSchema` / `canaryTestResultSchema` (permissive on unmodeled fields, mirroring `severity`-as-string in the existing finding schema so one bad field never drops the whole record).
- `readRunHistory(opts?: { cwd?: string; limit?: number })`: resolves `test-results/reports/history-v2.jsonl` under `cwd`, splits on newlines, `safeParse`s each line, drops malformed lines, returns the valid `CanaryRunRecord[]` (newest-last, optional `limit`). Never throws; missing file → `[]`.
- Degrade reasons reuse the existing taxonomy where meaningful (`not-installed` → no store file; `bad-output` → all lines malformed).

### MCP tool (`packages/cli/src/mcp/tools/canary.ts` + `server.ts`)

- `canary_run_history` — thin handler delegating to `createCanaryAdapter().readRunHistory()`, returning the JSON array (or `[]`). Registered in `server.ts`; added to the tool-count / capability-declaration / tier / `ALL_MCP_TOOLS` registries.

### Graph ingest (`packages/graph/src/ingest/CanaryResultsIngestor.ts`)

- Constructor `(store, records)` — records are supplied by the MCP layer (which reads them via the adapter), keeping `@harness-engineering/graph` free of any canary dependency (boundary stays in `intelligence`/`cli`).
- `ingest()`: writes run + per-test `test_result` nodes and edges; returns the standard `IngestResult`.
- `ingest_source` handler: new `source: 'test-results'` branch reads records via the adapter (in the CLI layer) and drives the ingestor.

### outcome-eval (`packages/intelligence/src/outcome-eval/`)

- `types.ts`: add `canaryRun?: CanaryRunOutcome` to `OutcomeEvalInput` (structured: `exitCode`, counts).
- `evaluator.ts`: a pure `withCanaryRunSignal(verdict, canaryRun)` folds a deterministic line into rationale (parallel to `withGuardianSignal`); `toExecutionOutcome` stamps additive `canary*` metadata keys (guarded by the connector's reserved-key stripping).

## Integration Points

### Entry Points
- New MCP tool `canary_run_history` (CLI MCP server).
- New `ingest_source` source value `test-results` (existing MCP tool, additive enum).
- New adapter method `CanaryAdapter.readRunHistory` + barrel exports from `@harness-engineering/intelligence`.
- New `CanaryResultsIngestor` exported from `@harness-engineering/graph` barrel.
- Extended `OutcomeEvalInput` contract (additive optional field).

### Registrations Required
- MCP tool registries: tool-count test, `tool-capability-declarations.ts`, `tool-tiers.ts`, `ALL_MCP_TOOLS`, `setup-mcp.ts`.
- Barrel exports: `packages/intelligence/src/adapters/index.ts`, `src/index.ts`; `packages/graph/src/index.ts`.
- Regenerate `docs/reference/mcp-tools.md` after a full build.

### Documentation Updates
- `docs/reference/mcp-tools.md` (generated).
- `docs/knowledge/intelligence/canary-adapter.md` — add the `readRunHistory` capability + the NDJSON acquisition decision.
- `docs/knowledge/graph/node-edge-taxonomy.md` — note canary as a `test_result` producer (Ingestor Responsibility Map).

### Architectural Decisions
- **D1 — Acquisition via documented NDJSON store (not CLI exec)** warrants a short ADR: it extends ADR-0039's boundary from "exec-only" to "exec + documented-artifact read", a reusable precedent for any future tool whose stable contract is a file rather than a CLI verb. Medium tier.

### Knowledge Impact
- Canary is a new external `test_result` producer in the graph taxonomy.
- The adapter boundary now spans two acquisition seams (exec + read) — a generalization of ADR-0039 worth capturing.

## Success criteria

1. `CanaryAdapter.readRunHistory()` returns a validated `CanaryRunRecord[]` from a well-formed `history-v2.jsonl`, and `[]` (never throws) when the file is missing, unreadable, or every line is malformed — proven with an injected reader in unit tests.
2. A malformed line among valid lines is dropped without discarding the valid records (permissive per-line parse).
3. `canary_run_history` MCP tool returns the JSON array; all whole-registry tool tests (count/capability/tier/`ALL_MCP_TOOLS`) pass.
4. `ingest_source({ source: 'test-results' })` creates `test_result` nodes for runs and tests with `tested_by`/`failed_in` edges to existing `file`/run nodes, and is a no-op (0 nodes, no throw) when no history file exists.
5. `outcome_eval` with a `canaryRun` input folds a deterministic signal into the rationale and stamps `canary*` metadata onto the `execution_outcome` node; ship authority stays TS-derived; omitting `canaryRun` yields a byte-identical verdict to today.
6. `harness skill validate` exit 0 (if any skill body changes); `pnpm generate:plugin:check` exit 0; `format:check` clean; `.harness/arch/baselines.json` byte-identical to origin/main; changeset present.
7. Graceful degradation is proven deterministically for every consumer (no canary / no results / malformed).

## Implementation order

- **Phase 1 — Adapter + MCP tool (acquisition foundation).** `readRunHistory` + `CanaryReader` seam + zod schemas; `canary_run_history` tool + registry sync; adapter unit tests (degrade taxonomy); docs regen.
- **Phase 2 — Graph ingest.** `CanaryResultsIngestor`; `ingest_source` `test-results` branch; ingestor unit tests (nodes/edges/no-op).
- **Phase 3 — outcome-eval mapping.** `canaryRun?` input + `withCanaryRunSignal` + node metadata stamping; additive-contract tests (absent = byte-identical).
- **Phase 4 — pulse (DEFERRED / follow-on).** Canary pulse adapter over `readRunHistory` emitting flaky-rate / failure-category distributions; requires the cross-layer `PulseSourceKind` extension. Not in this PR.
- **Phase 5 — ADR + changeset + docs.** ADR for D1; `@harness-engineering/cli` minor (+ intelligence/graph as touched); knowledge-doc updates.
