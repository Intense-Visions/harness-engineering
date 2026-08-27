# Reproducing the graph token-savings benchmark

> Issue #1271. This document is the methodology. The measured number on this repo lives in
> [`RESULTS.md`](./RESULTS.md); the machine-readable result is
> [`results/latest.json`](./results/latest.json).

## What this measures

Harness ships code-graph context-scoping (`query_graph`, `ask_graph`, `get_impact`,
`compute_blast_radius`, `code_outline`, `find_context_for`) — the exact capability its two
closest competitors benchmark and market — and had never published a number for it. This
benchmark measures how much **retrieval cost** the graph-scoped tools save over the naive
file-by-file exploration a graph-less agent is forced into.

Two **objective, deterministic** axes are measured:

- **Tokens** — the size (chars ÷ 4, mirroring core's `estimateTokens`) of the exact text each
  strategy puts into the model's context to answer a question.
- **Tool calls** — how many discrete retrieval calls each strategy makes.

Answer quality — the comparator's third axis ("83%") — is **not** measured here. Grading whether
each strategy's payload actually answers the question requires an LLM judge and is non-deterministic;
it is a deferred slice (see [Deferred slices](#deferred-slices)).

## The honest target

The number we hold ourselves to is the arXiv comparator figure — `DeusData/codebase-memory-mcp`,
preprint **2603.27277**: **~10× fewer tokens, ~2.1× fewer tool calls, 83% answer quality across 31
real repos**. That is the honest number, **not** the flattering **99.2%** README figure that came
from 5 hand-picked structural queries.

We accept that our measured number may be unflattering: harness's graph is multi-purpose (review
scoping, impact, blast radius) where both comparators are single-purpose and optimized for exactly
this metric. A losing result is a roadmap input, not a reason to suppress the measurement. The
benchmark reports whatever it measures.

## How to reproduce

From the repo root, on Node 22 (`.nvmrc`):

```bash
pnpm install
pnpm --filter @harness-engineering/cli build
node packages/cli/dist/bin/harness.js graph scan        # build this repo's graph
pnpm run bench:graph-tokens                              # measure + print the table
```

To also write the machine-readable result:

```bash
node packages/cli/dist/bin/harness.js graph bench \
  --out docs/benchmarks/graph-token-savings/results/latest.json
```

Flags: `--json` (emit the full result to stdout), `--out <path>` (write result JSON),
`--top <n>` (anchors per structural family, default 5).

The run is deterministic given a fixed graph: anchors are derived from graph structure, and the
fixed task-context inputs live in the source (`packages/cli/src/commands/graph/bench.ts`).

## Method

### Scenario families (one per named graph tool)

| Family         | Graph tool (real handler)  | Anchor selection                  | Naive baseline (no graph)                                  |
| -------------- | -------------------------- | --------------------------------- | ---------------------------------------------------------- |
| `impact`       | `handleGetImpact`          | top-N inbound-degree file nodes   | grep symbol basename → read every matching file in full    |
| `blast-radius` | `handleComputeBlastRadius` | top-N inbound-degree file nodes   | grep symbol basename → read every matching file in full    |
| `dependencies` | `handleQueryGraph` depth 2 | top-N outbound-degree file nodes  | read the anchor file + every locally-imported file in full |
| `outline`      | `handleCodeOutline`        | top-N largest source files        | read the whole anchor file                                 |
| `find-context` | `handleFindContextFor`     | fixed generic developer intents   | keyword grep from intent → read top-K matching files       |
| `ask`          | `handleAskGraph`           | fixed generic developer questions | keyword grep from question → read top-K matching files     |

The graph side invokes the **real shipped MCP tool handlers** — the same code paths an agent hits.
This is dogfooding, not a re-implementation.

**Density modes.** For the structural families the graph side uses each tool's context-_scoping_
mode — `get_impact --summary`, `query_graph --summary`, `compute_blast_radius --compact` — because
that is the surface an agent actually surfaces into context (counts + top-risk items), not the full
subgraph. Detailed mode on hub nodes is unbounded (see the detailed-mode finding in
[`RESULTS.md`](./RESULTS.md)); it is deliberately excluded from the headline and documented as a
finding rather than silently measured. The consequence — the graph returns a scoped summary while
the naive side returns full content — is exactly why the **answer-quality axis is deferred**: the
token ratio is "cost to retrieve a scoped answer", and whether that answer suffices is unmeasured.

### Fairness rules

- **Identical estimator both sides.** Both strategies count tokens with the same `chars ÷ 4`
  estimator over the exact context text they would surface. The reported result is the **ratio**
  between strategies; absolute token counts are approximate.
- **Shared file universe.** Both strategies operate over the repo's source files (equivalently
  `git ls-files` filtered to code extensions). The naive side discovers files by search + full
  read; it gains no graph semantics from the shared enumeration.
- **Conservative naive baseline.** The naive side reads whole files because a graph-less agent
  cannot scope within a file. This can _understate_ naive cost (a real agent also reads unrelated
  files), so the reported savings is a **lower bound**.

### What the number means

- `tokenSavings = naiveTokens / graphTokens` — "× fewer tokens".
- `toolCallSavings = naiveToolCalls / graphToolCalls` — "× fewer tool calls".

Reported per-family and overall.

## Deferred slices (`Refs #1271`)

- **Answer-quality axis (the "83%").** Needs an LLM judge grading each payload against the question.
- **Multi-repo corpus.** The comparator spans 31 repos; this harness runs on one repo at a time.
  Broadening to a corpus (loop the two steps over N cloned repos, aggregate) is additive.
- **Head-to-head against the competitors' own harnesses.** This measures harness vs a naive
  baseline, not against `codebase-memory-mcp` / `code-review-graph` in-process.
