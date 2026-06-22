---
title: Five-Signal Dashboard Panel
status: draft
milestone: v5.0 Load-Bearing Harness
roadmap_ref: github:Intense-Visions/harness-engineering#534
priority: P0
keywords: [dashboard, signals, signal-provider, timeline-cache, execution-outcome, graph, default-landing, drift-detection]
---

# Five-Signal Dashboard Panel

## Overview and Goals

The dashboard surfaces operational data (maintenance, routing, health) but has no
curated **signal layer** — the five-or-six signals that, if any of them moves, a
senior wants to know inside the hour (article gear item #7; roadmap #534).

This feature ships a **Signals** panel as the dashboard's default landing view,
rendering five curated signals, and documents the chosen five in a new
`docs/standard/signals.md`. The five:

| Signal | Question it answers | Data source |
|--------|---------------------|-------------|
| `pr-merged-without-multi-persona-review` | Are PRs landing without the multi-persona review firing? | git log + gh API (30d), cached |
| `coverage-trend-down-30d` | Is test coverage eroding? | coverage points (30d), cached |
| `complexity-trend-up-30d` | Is structural complexity creeping up? | `.harness/arch/timeline.json` |
| `baseline-auto-update-count` | Are baselines being silently auto-updated? | git log of `*-baselines.json` (30d), cached |
| `eval-fail-rate` | Are shipped changes failing post-merge eval? | graph `execution_outcome` nodes |

**Goals**

- A `/s/signals` page that renders all five signals as cards with current value,
  30-day trend, threshold status, and a sparkline.
- `/` redirects to `/s/signals` so the dashboard opens on the signal layer.
- Each signal isolated behind a `SignalProvider`; a failing or not-yet-available
  signal degrades to a per-card `error` / `pending` state without taking down the panel.
- `eval-fail-rate` consumes `harness:outcome-eval` output **via the knowledge graph**,
  with zero code/file dependency on that parallel work.
- `docs/standard/signals.md` records the five, their thresholds, sources, and rationale.

**Non-goals (YAGNI)**

- No configurable/user-defined signal sets — the five are curated and fixed for this iteration.
- No alerting/notification delivery (email, Slack) — the panel surfaces; delivery is a separate concern.
- No historical drill-down pages per signal — a sparkline + current value is the bar.
- Not building `harness:outcome-eval` here — only consuming its graph output when present.

## Decisions Made

1. **Scope: all five signals fully wired now** (not a framework-with-stubs). Includes
   the new PR-review-detection derivation and a coverage-trend source. _Rationale:_ the
   roadmap item is explicitly "5-signal"; a partial panel under-delivers the gear item.
2. **`eval-fail-rate` consumed via graph `execution_outcome` nodes.** `execution_outcome`
   is already a registered node type (`packages/graph/src/types.ts:28`) and the dashboard
   already reads the graph through `GraphStore` (`packages/dashboard/src/server/gather/graph.ts`).
   _Rationale:_ zero import coupling to the parallel outcome-eval work, and aligns with
   STRATEGY.md's graph-as-durable-substrate bet (`STRATEGY.md#our-approach`). The only
   shared contract is the node shape.
3. **Placement: new `/s/signals` SystemRoute page; `/` redirects to it.** _Rationale:_
   honors "default landing view" literally while respecting the existing chat-first
   architecture and the uniform `/s/:systemPage` routing pattern; reversible via one redirect.
4. **History: hybrid derive-now + cache-to-timeline.** Time-series signals derive their
   30-day window from git/gh/graph on first computation, persist daily points to
   `.harness/signals/timeline.json`, and read cache on subsequent loads; the initial 30
   days are backfilled once. _Rationale:_ real data on day one (no cold-start gap) plus
   fast steady-state reads.
5. **Architecture: `SignalProvider` registry + shared `SignalTimelineStore`.** Five
   providers register in an array; the gatherer iterates with `Promise.allSettled` for
   per-signal isolation. The derive→cache→backfill mechanism is factored into one
   `SignalTimelineStore` service rather than triplicated across the three time-series signals.

## Technical Design

### File layout (all under `packages/dashboard/`)

```
src/server/signals/
  types.ts                 # SignalId, SignalResult, SignalProvider, SignalContext
  timeline-store.ts        # SignalTimelineStore (.harness/signals/timeline.json)
  registry.ts              # ordered array of the five providers
  providers/
    pr-review.ts           # pr-merged-without-multi-persona-review
    coverage-trend.ts      # coverage-trend-down-30d
    complexity-trend.ts    # complexity-trend-up-30d  (reads arch/timeline.json)
    baseline-updates.ts    # baseline-auto-update-count
    eval-fail-rate.ts      # eval-fail-rate (graph execution_outcome)
src/server/gather/signals.ts   # gatherSignals(projectPath) -> SignalsResult
src/server/routes/signals.ts   # GET /api/signals
src/client/pages/Signals.tsx   # panel UI (reuses KpiCard / new SignalCard)
```

### Core types (`src/server/signals/types.ts`)

```ts
export type SignalId =
  | 'pr-merged-without-multi-persona-review'
  | 'coverage-trend-down-30d'
  | 'complexity-trend-up-30d'
  | 'baseline-auto-update-count'
  | 'eval-fail-rate';

export type SignalStatus = 'ok' | 'warn' | 'alert' | 'pending' | 'error';

export interface SignalPoint { date: string; value: number; } // date = YYYY-MM-DD

export interface SignalResult {
  id: SignalId;
  label: string;
  value: number | null;            // current value; null when pending/error
  unit: string;                    // '%', 'count', ...
  trend: 'up' | 'down' | 'flat';
  betterDirection: 'up' | 'down';  // which way is healthy (drives status color)
  status: SignalStatus;
  threshold: { warn: number; alert: number };
  history: SignalPoint[];          // up to 30 daily points
  detail: string;                  // human-readable one-liner
  source: string;                  // provenance, e.g. 'arch/timeline.json'
}

export interface SignalContext {
  projectPath: string;
  now: Date;
  timeline: SignalTimelineStore;
  graphStore?: import('@harness-engineering/graph').GraphStore;
}

export interface SignalProvider {
  id: SignalId;
  label: string;
  compute(ctx: SignalContext): Promise<SignalResult>;
}
```

### `SignalTimelineStore` (`src/server/signals/timeline-store.ts`)

Persists to `.harness/signals/timeline.json`:

```jsonc
{ "version": 1, "signals": { "<signalId>": [ { "date": "2026-06-22", "value": 0.81 } ] } }
```

- `read(id): SignalPoint[]` — last 30 days for a signal.
- `appendPoint(id, date, value)` — idempotent per (id, date); no-op if the day exists.
- `backfill(id, points)` — one-time seed of historical points (merge, never overwrite newer).
- `has(id, date): boolean` — used to skip re-derivation for already-cached days.

Atomic write (temp file + rename). Tolerates a missing/corrupt file by treating it as empty
(soft-fail), so a bad cache never blocks the panel — it just re-derives.

### Provider derivation

- **complexity-trend-up-30d** — read `.harness/arch/timeline.json` (already a time-series of
  arch metrics); extract the complexity metric per day over 30d. No git/gh needed.
- **baseline-auto-update-count** — `git log --since=30.days -- '*-baselines.json'`, count
  commits authored by the baseline-refresh bot / pre-commit auto-update (matched by author +
  message pattern). Cache the daily count via the timeline store.
- **pr-merged-without-multi-persona-review** — enumerate PRs merged in the last 30d (gh API,
  fall back to merge-commit walk); for each, detect whether multi-persona review fired
  (review records / commit trailers). Count those where it did not. Cache daily counts;
  gh calls go through `gather-cache.ts`. Degrades to `error` (not crash) if gh is unavailable.
- **coverage-trend-down-30d** — read coverage points from the project's coverage output
  (CI artifact / coverage-summary); compute 30d trend. Cache daily. Degrades to `error`
  when no coverage source is found, with `detail` explaining how to enable it.
- **eval-fail-rate** — `graphStore.findNodes({ type: 'execution_outcome' })`, filter to last
  30d, compute fail fraction. When zero such nodes exist (outcome-eval not yet shipped),
  return `status: 'pending'` with `value: null` and a detail noting the dependency. This is
  the documented graph contract — no import of outcome-eval code.

### Gatherer + route

- `gatherSignals(projectPath)` builds the `SignalContext` (constructs `SignalTimelineStore`,
  loads `GraphStore` best-effort), runs `registry` through `Promise.allSettled`, maps a
  rejected provider to a `status: 'error'` `SignalResult`, and returns
  `{ signals: SignalResult[], generatedAt: string }`. Internal — called with resolved paths,
  never from HTTP input (mirrors `gatherHealth`'s `@internal` contract).
- `GET /api/signals` in `routes/signals.ts`, registered in `serve.ts` next to the other
  gather routes. Read-only.

### Client

- `pages/Signals.tsx`: fetches `/api/signals`, renders five `SignalCard`s (reusing `KpiCard`
  where it fits). Each card shows label, current value+unit, trend arrow, sparkline from
  `history`, and a status color from `status`. `pending`/`error` render a muted card with
  the `detail` string.
- Register `'signals'` in `SYSTEM_PAGE_COMPONENTS` (`components/layout/ThreadView.tsx`).
- In `main.tsx`, add `<Route path="/" element={<Navigate to="/s/signals" replace />} />`
  (replacing the current `HomeRoute` mount at `/`; chat remains reachable at its existing route).

### Thresholds (defaults; documented in signals.md)

| Signal | warn | alert | better |
|--------|------|-------|--------|
| pr-merged-without-multi-persona-review | ≥1 | ≥3 (30d) | down |
| coverage-trend-down-30d | −1% | −5% (30d) | up |
| complexity-trend-up-30d | +5% | +15% (30d) | down |
| baseline-auto-update-count | ≥1 | ≥5 (30d) | down |
| eval-fail-rate | >5% | >10% (30d) | down |

## Integration Points

- **Entry Points:** new `GET /api/signals` route; new `/s/signals` client page; new `/`
  redirect; new server module `src/server/signals/`.
- **Registrations Required:** add `'signals'` to `SYSTEM_PAGE_COMPONENTS`; register the route
  in `serve.ts`; add the `/`→`/s/signals` redirect in `main.tsx`. No barrel export outside the
  dashboard package.
- **Documentation Updates:** new `docs/standard/signals.md` (the five signals, sources,
  thresholds, rationale); link it from `docs/standard/index.md`; note the new landing behavior
  in the dashboard section of AGENTS.md if present.
- **Architectural Decisions:** Decision #2 (eval-fail-rate via graph `execution_outcome` nodes)
  warrants a standalone ADR — it establishes the **graph as the cross-skill integration contract**
  between dashboard and outcome-eval, a pattern future signals/skills will follow. Decision #4
  (hybrid derive-now+cache timeline) is a localized mechanism, not ADR-worthy.
- **Knowledge Impact:** the concept of a **curated signal** (vs. raw operational metric), the
  `SignalProvider` pattern, and the `execution_outcome` consumption contract should enter the
  knowledge graph so future dashboard work discovers them.

## Success Criteria

1. `/s/signals` renders all five signal cards; `/` redirects to it.
2. `complexity-trend-up-30d` shows real data sourced from `.harness/arch/timeline.json` on first load.
3. `baseline-auto-update-count` and `pr-merged-without-multi-persona-review` show a real 30-day
   window backfilled from git/gh on first load, and read from `.harness/signals/timeline.json` thereafter.
4. `coverage-trend-down-30d` shows a trend when a coverage source exists, else a clear `error`
   card explaining how to enable it — never a crash.
5. `eval-fail-rate` shows `pending` when no `execution_outcome` nodes exist, and a real fail
   rate once they do — with no import of outcome-eval code.
6. A single failing/unavailable provider degrades its own card only; the other four still render
   (`Promise.allSettled` isolation).
7. `SignalTimelineStore` survives a missing/corrupt `timeline.json` by re-deriving (soft-fail).
8. `docs/standard/signals.md` documents the five signals, sources, and thresholds.
9. `harness validate` passes after the change.

## Implementation Order

1. **Types + timeline store** — `signals/types.ts`, `signals/timeline-store.ts` (+ unit tests:
   append idempotency, backfill merge, corrupt-file soft-fail).
2. **Ready signal** — `complexity-trend.ts` from `arch/timeline.json`; prove the provider→gatherer→route path end-to-end.
3. **Git-derived signals** — `baseline-updates.ts`, `pr-review.ts` with hybrid backfill+cache.
4. **Coverage + eval** — `coverage-trend.ts` (with graceful `error`), `eval-fail-rate.ts`
   (graph query, `pending` path).
5. **Gatherer + route** — `gather/signals.ts`, `routes/signals.ts`, register in `serve.ts`.
6. **Client panel** — `pages/Signals.tsx`, `SYSTEM_PAGE_COMPONENTS` registration, `/` redirect.
7. **Docs** — `docs/standard/signals.md` + index link; `harness validate`.
