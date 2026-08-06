# Design-Craft Award Bar — a machine-derived award-tier verdict on BENCHMARK output

**Keywords:** design-craft, benchmark, award-bar, exemplar-relative, radar, authority-in-ts, confidence-gate

## Overview and goals

The BENCHMARK phase of `harness-design-craft` scores a target against curated exemplars on a 5-dimension radar and emits `overall.score` (0–100) + `min(confidence)` + narrative `gaps` (`packages/cli/src/design-craft/findings/schema.ts:122`). It does **not** emit any machine verdict on whether the target has reached "award tier." Downstream agents therefore fall back to unreliable free-hand judgment ("fast-mode judgment, ~82") when asked "is this good enough?" — the exact gap that surfaced in a consuming project's session ("`awardBar` is still false on everything").

Two clarifications ground this spec:

1. **The MarketingPage exemplar corpus already exists in this repo** — 9 award-documented exemplars (CRAFT-B009–B017), wired into `SEED_EXEMPLARS` (`packages/cli/src/design-craft/catalog/exemplars/index.ts:73`), governed by ADR 0082. A consuming project that "lacks the corpus" is running a **stale installed `@harness-engineering/cli`** and needs `npm update`, not code work here.
2. **`awardBar` does not exist anywhere in the product.** It is the genuinely missing capability, and it is what this spec adds.

**Goal:** turn the existing radar into an honest, machine-derived award-tier verdict — computed in TypeScript, never emitted by the LLM — so both humans and downstream agents get a legible `cleared | not-cleared | indeterminate` instead of a guess.

**Non-goals (YAGNI):** no changes to how the radar itself is scored; no new exemplars; no vision-mode changes; no graph-node authoring (deferred — CRAFT_SCORE node writing is not yet implemented; awardBar rides along when it lands).

**Strategy grounding:** advances the **Ceiling-raising via LLM judgment** track (`STRATEGY.md#tracks`) — a TS-derived verdict over an LLM score, the same authority-in-TS pattern `outcome-eval`/`acceptance-eval` already use (authority in TS, never the LLM).

## Decisions made

- **D1 — Per-dimension bar, not a single overall threshold.** ADR 0082 diagnosed that template-y pages "score 88–94 [overall] while still carrying every template tell." An equal-weight mean hides the weak axis; a hard overall bar would still certify those pages. A per-dimension bar fails the exact axis that is weak. Consistent with ADR 0019 (never collapse the axes). *(Human decision, this session.)*
- **D2 — Hybrid exemplar-relative bar (Approach 3).** Per dimension, floor = `max(configFloor, round(fraction × median(cited-exemplar references)))`. The corpus defines the bar (no magic number for "award tier"), a hard config floor keeps it from eroding, and the **median** makes it robust to one weak exemplar. *(Human decision, this session.)*
- **D3 — Low confidence forces `indeterminate`.** If any radar dimension's confidence is below `confidenceFloor` (default `medium`), the verdict is `indeterminate` regardless of scores. A high score the model isn't sure about must never certify award tier. Honors ADR 0018/0019.
- **D4 — Authority in TypeScript.** `awardBar` is computed by a pure function from the parsed radar + cited exemplars + config. The LLM never emits the verdict — it only produces the radar it always has.

## Technical design

### Data structures (`packages/cli/src/design-craft/findings/schema.ts`)

```ts
export type AwardVerdict = 'cleared' | 'not-cleared' | 'indeterminate';

export type RadarDimensionName =
  | 'philosophicalCoherence' | 'hierarchy' | 'craftExecution' | 'function' | 'innovation';

export interface AwardBarDimension {
  score: number;    // target's radar score for this dimension (echoed for legibility)
  floor: number;    // derived bar the target had to clear
  cleared: boolean; // score >= floor
}

export interface AwardBar {
  verdict: AwardVerdict;                                     // TS authority; never LLM-emitted
  dimensions: Record<RadarDimensionName, AwardBarDimension>;
  shortfalls: RadarDimensionName[];                          // dims below floor ([] when cleared)
  reason?: string;                                           // e.g. 'low-confidence' when indeterminate
}
```

Add `awardBar: AwardBar` as a required field on `BenchmarkScore`.

### Computation (`packages/cli/src/design-craft/phases/award-bar.ts` — new)

```ts
export interface AwardBarConfig {
  dimensionFloor: number;   // hard safety floor, default 80
  fraction: number;         // fraction of median exemplar reference, default 0.95
  confidenceFloor: Confidence; // default 'medium'
}

export function computeAwardBar(
  radar: BenchmarkScore['radar'],
  exemplars: ExemplarDefinition[],
  config: AwardBarConfig,
): AwardBar;
```

Algorithm:
1. Per dimension `d`: `refs = exemplars.map(e => e.radarReference[d])`; `floor = max(config.dimensionFloor, round(config.fraction × median(refs)))`; `cleared = radar[d].score >= floor`.
2. **Confidence gate:** if any `radar[d].confidence` ranks below `config.confidenceFloor` → `verdict = 'indeterminate'`, `reason = 'low-confidence'` (dimensions/shortfalls still populated for legibility).
3. Else `verdict = shortfalls.length === 0 ? 'cleared' : 'not-cleared'`.

`median` handles even-length arrays (mean of the two middle values); empty `refs` (defensive — `runBenchmark` guarantees ≥1 cited exemplar) falls back to `config.dimensionFloor`. Confidence ranking reuses the existing `CONFIDENCE_RANK` from `benchmark.ts`.

### Wiring

- `benchmark.ts`: `BenchmarkArgs` gains `awardBar?: AwardBarConfig` (defaulted when absent). `buildScore()` calls `computeAwardBar(radar, matchedExemplars, cfg)` and sets `awardBar` on the returned `BenchmarkScore`. The `matched` exemplars are already in scope.
- `mcp/tools/design-craft.ts:406`: read `design.craft.benchmark.awardBar` from project config and pass it into `runBenchmark({ … , awardBar })`.

### Config (`packages/cli/src/config/schema.ts`, in `DesignCraftConfigSchema` at :251)

```ts
benchmark: z.object({
  awardBar: z.object({
    dimensionFloor: z.number().min(0).max(100).default(80),
    fraction: z.number().min(0).max(1).default(0.95),
    confidenceFloor: z.enum(['high', 'medium', 'low']).default('medium'),
  }).optional(),
}).optional(),
```

Omitting the block uses the defaults (80 / 0.95 / medium).

### Report

The markdown formatter in `design-craft.ts` renders one verdict line per benchmarked target: `AWARD BAR: CLEARED` / `not cleared — shortfalls: innovation, craftExecution` / `indeterminate — low confidence`.

## Integration Points

- **Entry Points** — No new entry points. Extends the existing BENCHMARK phase output of the `design_craft` MCP tool; `awardBar` becomes part of every `BenchmarkScore`.
- **Registrations Required** — None (no new barrel export, skill, route, or command). New `award-bar.ts` module is imported internally by `benchmark.ts`.
- **Documentation Updates** — `agents/skills/*/harness-design-craft/SKILL.md` BENCHMARK section documents the verdict and config (all four client copies, no internal roadmap/PR/issue refs per shipped-artifact rule). A `.changeset/` entry.
- **Architectural Decisions** — **D2 (hybrid exemplar-relative bar)** and **D3 (low-confidence → indeterminate)** together warrant one standalone ADR: they define how an LLM radar becomes a machine award verdict and encode the confidence-honesty rule — a decision future BENCHMARK work must not re-litigate.
- **Knowledge Impact** — When CRAFT_SCORE graph-node authoring lands (currently unimplemented), `awardBar.verdict` should be an attribute on the node so award-tier attainment is queryable over time. No graph write in this change.

## Success criteria

1. `computeAwardBar` returns `cleared` iff every dimension score ≥ its derived floor **and** every dimension confidence ≥ `confidenceFloor`.
2. Returns `indeterminate` (reason `low-confidence`) when any dimension confidence < `confidenceFloor`, regardless of scores.
3. Returns `not-cleared` with a populated `shortfalls` array listing exactly the dimensions below floor.
4. Derived floor per dimension = `max(dimensionFloor, round(fraction × median(cited exemplar references)))`; a single low outlier exemplar does not drag the floor below the median-based value (unit-tested).
5. Every `BenchmarkScore` in `DesignCraftOutput.scores` carries a well-formed `awardBar`.
6. `design.craft.benchmark.awardBar.*` overrides defaults; omitting the block yields 80 / 0.95 / medium.
7. The markdown report shows the verdict per benchmarked target.
8. All pre-existing design-craft tests still pass.

## Implementation order

1. **Schema** — add `AwardVerdict`/`AwardBar`/`AwardBarDimension` types + `awardBar` on `BenchmarkScore` (`findings/schema.ts`); add `benchmark.awardBar` to `DesignCraftConfigSchema` (`config/schema.ts`).
2. **Compute** — `phases/award-bar.ts` pure `computeAwardBar()` + unit tests (cleared / not-cleared / indeterminate / median / safety-floor / outlier-robustness).
3. **Wire** — thread config through `runBenchmark`/`buildScore` (`benchmark.ts`) and from the MCP tool (`design-craft.ts`).
4. **Report + integration test** — render the verdict; extend `tests/design-craft/integration/benchmark-phase.test.ts` to assert `awardBar` is present and correct.
5. **Docs** — SKILL.md BENCHMARK section (4 client copies), ADR, changeset.
