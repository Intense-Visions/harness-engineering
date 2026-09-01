# Refinement-request instrumentation (progressive context, demand signal)

> Scoped slice of #1632 "Progressive context encoding". Builds ONLY the
> refinement-request instrumentation stream — the independent, higher-value
> half the issue calls out. Progressive-by-default contracts and the
> prefetch/batching policy are **deferred** to a follow-up slice.

**Keywords:** progressive-context, refinement, context-class, demand-signal, code-unfold, telemetry, instrumentation, jsonl

## Overview

Full-resolution-by-default context spends tokens against the _possibility_ of
attention rather than its presence. Progressive serving replaces that guess with
a measured demand signal: refinement frequency per context class. The refinement
operations already exist as MCP tools — `code_outline`, `code_search`,
`code_unfold` (`packages/cli/src/mcp/tools/code-nav.ts`), backed by the
AST-bounded `packages/core/src/code-nav` engine. What is missing is the
**measurement layer**: a log of every refinement request tagged with its context
class, and an aggregation that turns that log into the demand signal downstream
compaction and dictionary work consume.

This slice builds exactly that layer. It does not change how any refinement
operation behaves and it does not make anything progressive-by-default.

### Goals

- Log every refinement request with a **context class** the moment it is served.
- Aggregate the log into **refinement frequency per context class** (the demand
  signal).
- Rank the classes by demand so a **never-read class sorts to the bottom**.
- Zero behavioral change to `code_outline` / `code_search` / `code_unfold`;
  instrumentation is strictly additive and never blocks a tool response.

### Out of scope (deferred — flagged for manual reconciliation of #1632)

- **Progressive-by-default contract** for every context class (coarse layer +
  refinement operations applied as the default for file content, history,
  telemetry, knowledge). Not built here.
- **Prefetch / batching policy** (task-class refinement priors that batch
  predictable unfolds to bound round-trip latency). Not built here.
- **Paired evaluation** (token cost vs. task outcomes, progressive vs.
  full-resolution). Not built here — it consumes this slice's demand log later.

## Decisions made

### D1 — Context-class taxonomy is the progressive _domain_ taxonomy, not the attribution loading taxonomy

`packages/core/src/context/attribution.ts` already defines a `ContextClass`
(`always-loaded | path-scoped | invoked-only`) that classifies _how_ a surface
loads. That is a different axis from what #1632 asks for. The demand signal is
keyed on the progressive **domain** the refinement touches:

`file-content | history | telemetry | knowledge`

These are named directly in the issue's Deliverables ("applied as the default
for file content, history, telemetry, and knowledge"). To avoid a name clash
with the existing `ContextClass`, this slice names its type
**`RefinementContextClass`**.

_Rationale:_ the two taxonomies answer different questions and must not be
conflated; a downstream reader that scores dictionary membership by demand needs
the domain axis, not the loading axis.

### D2 — Classification is operation-driven with an explicit override

Each refinement **operation** maps to a default context class via a fixed,
documented table:

| Operation          | Default context class | Backing tool (today) |
| ------------------ | --------------------- | -------------------- |
| `outline`          | `file-content`        | `code_outline`       |
| `search`           | `file-content`        | `code_search`        |
| `unfold`           | `file-content`        | `code_unfold`        |
| `expand-diff`      | `history`             | _(future)_           |
| `expand-rationale` | `knowledge`           | _(future)_           |
| `expand-telemetry` | `telemetry`           | _(future)_           |

The recorder accepts an optional explicit `contextClass` that overrides the
default, so a future caller unfolding a decision's rationale from a knowledge
node can record `knowledge` even though it reuses the `unfold` operation. The
three operations wired **in this slice** are the three that have real tools
today (all `file-content`); the future operations exist in the taxonomy so the
demand aggregation enumerates every class (see D4).

### D3 — Split pure logic (core) from filesystem IO (cli), mirroring skill-telemetry

- **Pure, IO-free, unit-tested logic** lives in
  `packages/core/src/context/refinement-demand.ts`: the taxonomy, the classifier,
  the record shape, and `aggregateDemand()`.
- **Filesystem IO** lives in `packages/cli/src/mcp/tools/refinement-telemetry.ts`,
  following the exact contract of the existing
  `packages/cli/src/mcp/tools/skill-telemetry.ts`: non-fatal (never throws,
  never blocks an MCP response), append-only JSONL under
  `.harness/metrics/refinement-events.jsonl`, timestamp stamped on write.

_Rationale:_ this is the established seam in the repo — pure core + IO-injected
CLI writer — and it keeps the demand math trivially testable without a
filesystem.

### D4 — Aggregation enumerates all classes so never-read classes rank last

`aggregateDemand()` always emits a row for **every** `RefinementContextClass`,
including classes with zero recorded requests, and sorts by count descending
(ties broken by canonical class order). A class nobody refined therefore lands at
the bottom of the ranking with `count: 0, frequency: 0`. This is the mechanism
behind acceptance criterion 3 and the issue's "demand log doubles as a report of
which context classes were never worth sending".

### D5 — Read surface is a CLI subcommand under `harness mcp`

The demand report is exposed as `harness mcp refinement-demand [--json]`,
mirroring the sibling `harness mcp context-report`
(`packages/cli/src/commands/mcp.ts`). It reads the JSONL and prints the ranked
per-class demand. No new MCP tool, no tool-tier/capability churn — the smallest
wired, exercised read surface.

## Technical design

### Data structures (`packages/core/src/context/refinement-demand.ts`)

```ts
export type RefinementContextClass = 'file-content' | 'history' | 'telemetry' | 'knowledge';

export const REFINEMENT_CONTEXT_CLASSES: readonly RefinementContextClass[] = [
  'file-content',
  'history',
  'telemetry',
  'knowledge',
];

export type RefinementOperation =
  | 'outline'
  | 'search'
  | 'unfold'
  | 'expand-diff'
  | 'expand-rationale'
  | 'expand-telemetry';

/** Fixed operation → default context-class table (documented, stable). */
export const OPERATION_CONTEXT_CLASS: Record<RefinementOperation, RefinementContextClass>;

/** One logged refinement request (the JSONL line shape, sans stamped timestamp). */
export interface RefinementRequest {
  operation: RefinementOperation;
  contextClass: RefinementContextClass;
  target?: string; // e.g. file path or symbol, non-identifying label
  timestamp?: string; // ISO; stamped by the writer
}

/** Classify an operation to its default context class (override wins upstream). */
export function classifyRefinement(operation: RefinementOperation): RefinementContextClass;

export interface ClassDemand {
  contextClass: RefinementContextClass;
  count: number;
  frequency: number; // count / total; 0 when total is 0
}

export interface RefinementDemandReport {
  total: number;
  byClass: ClassDemand[]; // ranked: count desc, then canonical class order
}

/** Pure aggregation: enumerate every class, rank, never-read classes sort last. */
export function aggregateDemand(requests: readonly RefinementRequest[]): RefinementDemandReport;
```

### Writer / reader (`packages/cli/src/mcp/tools/refinement-telemetry.ts`)

```ts
export const REFINEMENT_EVENTS_FILE = join('.harness', 'metrics', 'refinement-events.jsonl');

/** Non-fatal append. Derives contextClass from operation when not given. */
export function recordRefinement(
  projectPath: string,
  input: { operation: RefinementOperation; contextClass?: RefinementContextClass; target?: string }
): void;

/** Read + parse the JSONL and aggregate. Missing/empty file → empty report. */
export function readRefinementDemand(projectPath: string): RefinementDemandReport;
```

Contract copied verbatim from `skill-telemetry.ts`: `mkdirSync(recursive)`,
`appendFileSync`, all wrapped in a `try/catch` that silently swallows — telemetry
must never interfere with tool execution. `readRefinementDemand` tolerates a
missing file (returns an all-zero report) and skips unparseable lines.

### Wiring (`packages/cli/src/mcp/tools/code-nav.ts`)

After each **successful** handler result, and only then, call `recordRefinement`:

- `handleCodeOutline` → `recordRefinement(root, { operation: 'outline', target })`
- `handleCodeSearch` → `recordRefinement(root, { operation: 'search', target })`
- `handleCodeUnfold` → `recordRefinement(root, { operation: 'unfold', target })`

`root` resolves to `process.cwd()` (the MCP server's project root, consistent
with the other filesystem-touching tools). The call sits outside the response
path — a thrown recorder can never change what the tool returns (guaranteed by
the writer's own try/catch, belt-and-suspenders with placement after the result
is computed).

### Read command (`packages/cli/src/commands/mcp.ts`)

`createMcpRefinementDemandCommand()` → `harness mcp refinement-demand [--json]`,
added to `createMcpCommand()` alongside `context-report`. Human format prints a
ranked table; `--json` emits `RefinementDemandReport`.

## Integration Points

### Entry Points

- New pure module `packages/core/src/context/refinement-demand.ts`.
- New CLI-owned writer/reader `packages/cli/src/mcp/tools/refinement-telemetry.ts`.
- New CLI subcommand `harness mcp refinement-demand`.
- Instrumentation call sites inside the three existing `code-nav` MCP handlers.

### Registrations Required

- Add the new exports to `packages/core/src/context/index.ts` (the curated
  re-export point; `core/src/index.ts` already does `export * from './context'`,
  so no core-barrel allowlist edit is needed).
- Register `createMcpRefinementDemandCommand()` in `createMcpCommand()`.
- Regenerate CLI reference docs (`pnpm run generate-docs`) — the pre-push
  reference-docs freshness gate blocks on a new subcommand otherwise.

### Documentation Updates

- Reference docs for `harness mcp` regenerate to include the subcommand.
- A short note in the change's own docs; no AGENTS.md change (additive tool).

### Architectural Decisions

None rise to a standalone ADR. D1 (taxonomy separation) is the only decision with
architectural weight and it is fully captured here; it introduces a parallel,
clearly-named type rather than altering the existing `ContextClass`.

### Knowledge Impact

Concepts entering the graph: _refinement request_, _refinement context class_,
_demand signal_ (refinement frequency per context class), and the relationship
"demand signal feeds rate-distortion compaction and trained-dictionary
membership scoring" (the downstream consumers named in #1632's Dependencies).

## Success Criteria

Seeded from #1632's acceptance criteria, narrowed to this slice:

1. **Each refinement request is logged with a context class.** When
   `code_outline` / `code_search` / `code_unfold` is invoked and succeeds, a
   JSONL line is appended to `.harness/metrics/refinement-events.jsonl` carrying
   `operation`, a `contextClass`, and a timestamp. _(Testable: invoke the
   handler against a fixture file, assert the line exists and classifies as
   `file-content`.)_
2. **An aggregation produces refinement-frequency-per-context-class.**
   `aggregateDemand` / `readRefinementDemand` returns one `ClassDemand` per
   class with `count` and `frequency = count/total`. _(Testable: feed a known
   mix, assert exact counts and frequencies.)_
3. **The demand log correctly ranks a seeded never-read context class at the
   bottom.** Given requests that touch some classes but not others, the untouched
   class appears last with `count: 0`. _(Testable: seed only `file-content` +
   `knowledge`, assert `telemetry` and `history` sort to the bottom with zero
   counts.)_
4. **Instrumentation is non-fatal.** A failing/unwritable metrics dir never
   changes a tool's response or throws. _(Testable: point the writer at an
   unwritable path, assert no throw and an unchanged handler result.)_

## Implementation Order

1. **Core demand module** — `refinement-demand.ts` (taxonomy, classifier,
   `aggregateDemand`) + unit tests; export via `context/index.ts`.
2. **CLI telemetry writer/reader** — `refinement-telemetry.ts` (`recordRefinement`,
   `readRefinementDemand`) + unit tests (append, non-fatal, parse-tolerant).
3. **Wire the three code-nav handlers** — additive `recordRefinement` calls +
   a handler-level test asserting a line is logged on success.
4. **Read subcommand** — `harness mcp refinement-demand [--json]`; regenerate
   reference docs.
5. **Provenance + verify** — write `provenance.json`, run build/typecheck/tests,
   push, open PR with `Refs #1632`.
