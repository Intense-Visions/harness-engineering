---
title: Agentic-suitability in the local-model pool recommender
status: draft
keywords: local-models, ranker, agentic, tool-calling, latency, dispatch, agentic-score
---

# Agentic-suitability in the local-model pool recommender

## Overview & Goals

The pool ranker (`packages/local-models/src/ranker/algorithm.ts`) scores candidates by VRAM fitness +
bandwidth-**estimated** speed + benchmark confidence, but never composes those into "is this model usable
for **autonomous agentic dispatch**" — and that gap picks unusable models. Live evidence (2026-07-16):
`llama3.3:70b` fits memory and its tokens/sec _estimate_ looked fine, but real agentic latency was a
**4-minute single call**; `qwen2.5-coder:7b` is fast but **won't emit `tool_calls`** (must be _excluded_
from agentic routing, not merely down-ranked); `qwen3-coder:30b` (MoE ~3B active) tool-calls and drives the
loop well.

**Goal:** add an **agentic-suitability** dimension the recommender/AMR use to select for dispatch, so a
fits-VRAM-but-can't-tool-call / too-slow model is never routed autonomous work. Keep the existing
size/speed/benchmark ranking untouched for non-agentic uses.

**Non-goals (YAGNI):** live candidate discovery from HF/Ollama library (that's
[[local-model-discovery-recommendation]]); learned build-quality (that's [[lmlm-build-quality-model-selection]] —
consumed here only as an optional input if present); changing AMR routing wiring (this exposes the score;
wiring it into routing is a separate step).

## Decisions made

- **D1 — The ranker stays pure; agentic signals arrive as candidate inputs.** `rankModels` is
  documented pure ("candidates in, ranked models out, no I/O"). Add two optional fields to
  `RankerCandidate`: `toolCalling?: boolean` (from the deterministic #833 probe) and
  `measuredAgenticLatencyMs?: number` (time-to-first-token / turn latency under a real agentic prompt).
  The ranker consumes them; it does NOT perform I/O. \_(Rationale: preserves the pure-orchestrator contract
  - testability.)\_
- **D2 — Tool-calling is a HARD gate.** `toolCalling === false` ⇒ `agenticEligible = false` and
  `agenticScore = 0` — excluded from agentic routing, not merely down-ranked. `undefined` (unprobed) ⇒
  eligible but flagged `toolCallingUnknown` (fail-open, matching the probe's own fail-open posture).
  _(Rationale: a model that can't tool-call cannot drive the loop at all.)_
- **D3 — Measured latency gates/penalizes, over a budget.** A `latencyBudgetMs` (RankOptions, default e.g.
  120*000) — a candidate whose `measuredAgenticLatencyMs` exceeds it is `agenticEligible = false`
  (unusable for an interactive loop); under budget, `agenticScore` scales inversely with latency. Unmeasured
  latency ⇒ fall back to the existing speed estimate (steeply discounted, flagged). *(Rationale: measured
  beats estimated; a 4-min call is disqualifying even if it "fits".)\_
- **D4 — `agenticScore` composes gate × latency × existing quality.** `agenticScore = eligible ?
f(latency) × benchmarkScore × (optional buildQuality) : 0`, exposed as a SEPARATE field on `RankedModel`
  alongside the existing `score`, plus `agenticEligible: boolean` and an `agenticReasons: string[]`
  (why ineligible / discounted). The default ranking order is unchanged; callers selecting for dispatch sort
  by `agenticScore`. _(Rationale: additive, non-breaking; a fits-but-unusable model is never top for
  dispatch.)_
- **D5 — A thin, opt-in probe helper (I/O) populates the fields.** Add
  `probeAgenticSignals(candidate, deps)` in `packages/local-models/src/capability/` that runs the existing
  `probeToolCalling` and a single timed agentic call to fill `toolCalling` + `measuredAgenticLatencyMs`.
  This is the ONLY I/O; it is separate from the pure ranker and unit-tested with an injected fetch.
  _(Rationale: keeps I/O out of the ranker; gives the recommender a one-call way to enrich candidates.)_

## Technical design

- `packages/local-models/src/ranker/types.ts` — `RankerCandidate` gains `toolCalling?: boolean` and
  `measuredAgenticLatencyMs?: number`; `RankedModel` gains `agenticScore: number`,
  `agenticEligible: boolean`, `agenticReasons: string[]`; `RankOptions` gains `latencyBudgetMs?: number`
  (+ optional `agenticWeight`).
- `packages/local-models/src/ranker/algorithm.ts` — in `scoreCandidate`, after the existing
  vram/speed/benchmark composition, compute the agentic fields (pure, from the candidate inputs + the
  existing `speedEstimate` fallback + `benchmarkScore`). Keep the primary `score`/ordering unchanged.
- Optionally a small pure `agentic.ts` module under `ranker/` holding the scoring so `algorithm.ts` stays
  within complexity budget (watch check-arch on `scoreCandidate`).
- `packages/local-models/src/capability/agentic.ts` (new) — `probeAgenticSignals` (D5), reusing
  `probeToolCalling` and a timed `/v1/chat/completions` call; injected `fetchImpl` for tests; never throws
  (fail-open to `undefined` signals).
- `packages/local-models/src/index.ts` — export the new candidate/ranked fields (already via types) and
  `probeAgenticSignals`.

## Integration Points

- **Entry Points:** the new agentic fields on `RankerCandidate`/`RankedModel`; `probeAgenticSignals`.
- **Registrations Required:** barrel export of `probeAgenticSignals` (check the local-models barrel /
  curated allowlist if one exists).
- **Documentation Updates:** the local-model ranker/recommender guide/knowledge doc — document `agenticScore`
  vs `score` and the tool-calling hard gate.
- **Knowledge Impact:** concept — _agentic suitability / agenticScore_; relationship —
  `ranker → gates on → tool-calling capability`.

## Success Criteria

- SC1: existing ranker output (the primary `score` + ordering) is unchanged when the new inputs are absent —
  existing ranker tests stay green.
- SC2: `toolCalling: false` ⇒ `agenticEligible === false`, `agenticScore === 0`, a reason naming
  "no tool-calling". Pure unit test.
- SC3: `measuredAgenticLatencyMs > latencyBudgetMs` ⇒ `agenticEligible === false` with a latency reason;
  under budget ⇒ `agenticScore` decreases as latency rises (monotonic). Pure unit test.
- SC4: `toolCalling: undefined` ⇒ eligible, flagged `toolCallingUnknown` (fail-open). Pure unit test.
- SC5: two candidates, one that can't tool-call and one that can — sorting by `agenticScore` puts the
  capable one first even if the incapable one has a higher raw `score`. Pure unit test.
- SC6: `probeAgenticSignals` with an injected fetch fills `toolCalling` + `measuredAgenticLatencyMs` and
  returns `undefined`-signals (never throws) on a transport error. Unit test.

## Implementation Order

- **Phase 1 — Pure agentic dimension.** Candidate/ranked/options fields + `scoreCandidate` composition +
  the pure scoring module; tests SC1–SC5.
- **Phase 2 — Probe helper + docs.** `probeAgenticSignals` (SC6) + barrel export + ranker doc note.
