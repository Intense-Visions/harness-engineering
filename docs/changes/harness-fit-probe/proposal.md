# Harness-Fit Probe — Empirical Agentic Evidence for Model Recommendation

**Keywords:** local-models, recommendation, ranker, agentic-suitability, buildQuality, convergence-probe, act-vs-narrate, canary

## Overview and Goals

**Problem.** The local-model recommendation engine ranks candidates by **benchmark evidence** (`ranker/evidence.ts`) plus a **heuristic + thin-probe** agentic dimension (`ranker/agentic.ts`, `capability/agentic.ts`). The thin probe measures only _"can the model emit a `tool_call`?"_ (`toolCalling`, the #833 probe) and _"is one turn fast enough?"_ (`measuredAgenticLatencyMs`). A live 3-way head-to-head (2026-07-18: `llama3.3:70b` vs `gpt-oss:20b` vs `qwen3.6:27b`) proved this is **necessary but insufficient** for autonomous coding: `llama3.3:70b` **passes** the tool-calling gate and is fast, yet it _narrated instead of acting_ (1 tool call, produced no artifact), while the smaller `gpt-oss:20b`/`qwen3.6:27b` _acted_ (explored the codebase, wrote real code) and converged. No benchmark or thin-probe signal predicted this — only running the real harness did.

**Insight — the slot already exists.** `ranker/types.ts` defines `buildQuality?` — _"Folded into `agenticScore` when supplied; absent ⇒ no effect"_ — and `scoreAgentic` already composes it (`eligible ? f(latency) × benchmarkScore × (buildQuality?) : 0`). It is a **wired-but-unfed** signal, purpose-built for _"how well does this model actually build?"_ This feature supplies it empirically.

**Goal.** Add a **harness-fit probe**: run a benchmark-shortlisted candidate through a small contained coding task on the real harness, judge whether it **converges** (the #892 `runLocalWorkflowGate` as verdict) and how **agentically** it behaves (act-vs-narrate from the recording stream), and emit a `buildQuality ∈ [0,1]` that flows into the existing `scoreAgentic` composition — no ranker-math change. So a narrate-only model ranks below an act-and-converge model at equal benchmark score, for the local-autonomous use case.

**Out of scope.** Changing benchmark scoring or the default (non-agentic) ranking (D4 of the agentic spec stays intact). Probing the full discovered set (cost-prohibitive). The primary/Claude path.

**On-strategy.** STRATEGY tracks a local-model pool that stays current _and usable_; benchmark rank keeps it current, the harness-fit probe keeps it usable.

## Decisions made

- **D1 — Feed the existing `buildQuality` slot (no ranker-math change).** The probe's output is a `buildQuality ∈ [0,1]` supplied as a candidate input, composed by the already-shipped `scoreAgentic`. _Why:_ the ranker is purpose-built for this; the head-to-head is just the missing empirical source. The agentic dimension is _already_ the local-autonomous selector (the recommender + AMR dispatch on `agenticScore`/`agenticEligible`, not the raw benchmark `score`), so `buildQuality` sharpens local selection without disturbing the default benchmark ranking.
- **D2 — Single-dispatch convergence micro-probe (not the full staged workflow).** The decisive signal (act vs narrate) shows in a _single_ dispatch on one contained task; the full staged run costs minutes-to-an-hour more for marginal signal. The probe runs one contained task per candidate and judges with `runLocalWorkflowGate` (converged?) + stream metrics. _Why:_ cheapest real signal.
- **D3 — Pure policy/scoring in `local-models`; injected I/O runner (dependency inversion).** `local-models` owns the pure parts — the probe _policy_ (which candidates, cadence, cache), the `buildQuality` mapping, and the task-suite schema — plus a `HarnessFitRunner` INTERFACE. The actual runner (a single-dispatch through `OllamaBackend` + a workspace + `runLocalWorkflowGate`) is IMPLEMENTED in `orchestrator`/CLI and injected at the composition root. _Why:_ keeps `local-models` free of an orchestrator dependency, mirroring how `capability/agentic.ts` injects `fetchImpl`; the machinery lives where it already is.
- **D4 — Small, adopter-portable, self-describing task suite (2–3 tasks).** Each probe task is a self-contained fixture carrying its own prompt + **acceptance command** (no hardcoded host-repo layout). Shipped with `local-models`. _Why:_ the adopter-portable constraint — probes must run in any adopter project, not just this monorepo.
- **D5 — Cost gating: benchmark-top-N, cadence, cache, prefilter, opt-in.** Probe ONLY the benchmark top-N (default N≈3–5); run on a cadence in `scheduler/refresh.ts` (not every discovery refresh); **cache** `buildQuality` keyed by `model+version` (stable until a new release); **prefilter** by VRAM-fit + `toolCalling !== false`; **opt-in** (like the existing probe). _Why:_ a probe is expensive (pull + run); never probe the whole set.
- **D6 — Fail-open, coarse verdict.** A probe error/timeout/pull-failure leaves `buildQuality` undefined → "no effect" → the ranker falls back to benchmark+heuristic rank; the pool is never blocked (matches the existing probe's posture). The verdict is coarse (converged / acted-not-converged / narrated) plus act metrics; best-of-N defaults to 1 for cost.

## Technical design

**`buildQuality` mapping (pure, `local-models`).** From the probe result:

- `converged` (gate passed within the probe's bounded attempts) → high (≈0.9–1.0, scaled by retries-to-converge).
- `acted but did not converge` (produced artifacts / multiple tool calls, gate still red) → mid (≈0.4–0.6).
- `narrated` (no artifact, ≤1 tool call — the llama3.3:70b failure mode) → low (≈0.0–0.15).
  Inputs: gate verdict + `toolsCalled`/`filesTouched` from the `session_end` stream stats + tool_execution count. Pure function `scoreBuildQuality(probeResult): number`.

**`HarnessFitRunner` interface (`local-models`).** `runProbe(model, task): Promise<HarnessFitResult>` where `HarnessFitResult` carries `{ converged, toolCalls, filesTouched, retries, tokens, durationMs, error? }`. Injected; a null/throwing runner → `buildQuality: undefined` (D6).

**Runner impl (`orchestrator`/CLI).** A single-dispatch of the candidate `OllamaBackend` against the probe task's prompt in a throwaway workspace, judged by `runLocalWorkflowGate` (the task's `acceptance` command as the gate command, reusing #892's acceptance-command seam), reading the recording stream for the act-vs-narrate metrics. Fully guarded → `error` on any failure.

**Probe task fixture schema (`local-models`).** `{ id, prompt, files?, acceptanceCommand }` — self-describing, portable. 2–3 shipped defaults (e.g. a pure util + its test, a small rule/function). Operator-overridable.

**Scheduler wiring (`scheduler/refresh.ts`).** After benchmark rank produces the shortlist, if the harness-fit probe is enabled and due (cadence) and a cached fresh `buildQuality` is absent, probe the top-N (prefiltered), cache the result, and thread `buildQuality` into the next rank.

## Integration Points

- **Entry Points.** No new user CLI/MCP required (may reuse the existing `canary_probe` seam). Internal: new `capability/harness-fit.ts` (interface + policy) + `ranker` consumption of `buildQuality` (already wired); an injected runner impl in `orchestrator`/CLI; `scheduler/refresh.ts` gating.
- **Registrations Required.** If a config surface is added (enable flag, cadence, N, task-suite override), extend the local-models config schema (avoid the strict-Zod silent-reject trap). Composition root wires the `HarnessFitRunner` impl.
- **Documentation Updates.** The local-model-lifecycle / recommendation docs: the harness-fit evidence tier, the `buildQuality` source, cost gating, and adopter-portability of probe tasks. Note the head-to-head as the motivating evidence.
- **Architectural Decisions.** D1 (empirical `buildQuality` as the agentic dimension's third tier) and D3 (pure policy + injected runner across the local-models/orchestrator boundary) warrant an ADR — they set the "benchmarks pre-filter, the harness judges fitness" boundary (the local-autonomous analogue of ADR 0077).
- **Knowledge Impact.** Concept: "harness-fit / convergence probe"; relationship: benchmarks-prefilter → probe-judges-agentic-fitness → buildQuality → agenticScore.

## Success Criteria

- **SC1** `scoreBuildQuality` (pure) maps converged→high, acted-not-converged→mid, narrated→low from a probe result. (unit test)
- **SC2** `buildQuality` flows into the existing `scoreAgentic` and re-ranks a narrate-only candidate below an act-and-converge candidate at equal benchmark score. (unit test on the ranker, injected observations)
- **SC3** The probe runner is injected and fail-open: a null/throwing runner (or a probe timeout/error) yields `buildQuality: undefined` → no ranking effect; the pool is never blocked. (unit test)
- **SC4** Cost gating: only the benchmark top-N (prefiltered by VRAM-fit + `toolCalling!==false`) are probed; results are cached by model+version; the cadence gate prevents probing every refresh; the full discovered set is never probed. (unit test on the scheduler policy)
- **SC5** Adopter-portable: a probe task self-describes its acceptance command; no host-repo layout is hardcoded; the default suite runs against a throwaway workspace. (unit test / fixture)
- **SC6** (live, optional) A real probe of `llama3.3:70b` vs `gpt-oss:20b`/`qwen3.6:27b` yields a lower `buildQuality` for the narrate-only model — reproducing the head-to-head verdict through the automated probe.

## Implementation Order

### Phase 1: Pure scoring + ranker wiring

`scoreBuildQuality` (pure) + confirm/extend `buildQuality` flow through `scoreAgentic` (SC1/SC2/SC3-pure). Failing tests first. <!-- complexity: low -->

### Phase 2: Probe runner + task suite (injected I/O)

`HarnessFitRunner` interface + the orchestrator/CLI single-dispatch impl (OllamaBackend + `runLocalWorkflowGate` judge + stream metrics) + the 2–3 portable task fixtures (SC5). Fail-open guards (SC3-io). Failing tests first. <!-- complexity: medium -->

### Phase 3: Scheduler gating + config + docs/ADR

Top-N/cadence/cache/prefilter policy in `scheduler/refresh.ts` (SC4) + config surface + ADR + docs + changeset (`@harness-engineering/local-models` minor; `@harness-engineering/orchestrator` minor if the runner impl lands there). <!-- complexity: medium -->
