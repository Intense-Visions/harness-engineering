---
number: 0081
title: 'Harness-fit probe: benchmarks pre-filter, the harness judges agentic fitness'
date: 2026-07-18
status: accepted
tier: integration
source: docs/changes/harness-fit-probe/proposal.md
---

## Context

The local-model recommendation engine ranks candidates by **benchmark evidence**
(`packages/local-models/src/ranker/evidence.ts`) plus a **heuristic + thin-probe**
agentic dimension (`ranker/agentic.ts`, `capability/agentic.ts`). The thin agentic
probe measures only two things: _"can the model emit a `tool_call`?"_
(`toolCalling`, the #833 probe) and _"is one turn fast enough?"_
(`measuredAgenticLatencyMs`). ADR 0077 fixed the discovery side — discovery is a
wide net, the benchmark ranker judges. But the ranker's agentic judgement is only
as good as its evidence, and for **autonomous coding** the existing evidence is
necessary but insufficient.

A live 3-way head-to-head (2026-07-18: `llama3.3:70b` vs `gpt-oss:20b` vs
`qwen3.6:27b`) proved the gap concretely. `llama3.3:70b` **passes** the
tool-calling gate and is fast, yet it _narrated instead of acting_ — one tool
call, no artifact produced, the gate never went green. The smaller
`gpt-oss:20b`/`qwen3.6:27b` _acted_: they explored the workspace, wrote real code,
and converged. **No benchmark score and no thin-probe signal predicted this** —
only running the real harness on a contained task surfaced the act-vs-narrate
split. The engine, ranking on benchmark + tool-calling, would have preferred the
narrator.

Crucially, the slot to carry this signal **already exists**. `ranker/types.ts`
defines `buildQuality?` — _"Folded into `agenticScore` when supplied; absent ⇒ no
effect"_ — and `scoreAgentic` already composes it
(`eligible ? f(latency) × benchmarkScore × (buildQuality?) : 0`). It is a
**wired-but-unfed** signal, purpose-built for _"how well does this model actually
build?"_ The gap is not the ranker math; it is the missing empirical source.

## Decision

**D1 — Empirical `buildQuality` is the agentic dimension's third evidence tier;
it feeds the existing slot (no ranker-math change).** A **harness-fit probe** runs
a benchmark-shortlisted candidate through a small contained coding task on the
real harness, judges convergence (the acceptance/`runLocalWorkflowGate` verdict)
and act-vs-narrate metrics from the recording stream, and maps them to a coarse
three-band `buildQuality ∈ [0, 1]` (`packages/local-models/src/capability/harness-fit.ts`,
`scoreBuildQuality`):

- **converged _with an artifact_** (`filesTouched > 0`) → HIGH (~0.9–1.0), scaled down
  by retries-to-converge. A converged-but-no-artifact result (e.g. a trivially-passing
  acceptance where the model narrated instead of building) is **suspect** and does NOT
  reach HIGH — it drops to the acted/narrated bands below;
- **acted-not-converged** (artifacts or ≥2 tool calls, gate still red) → MID (~0.4–0.6);
- **narrated** (no artifact, ≤1 tool call — the `llama3.3:70b` mode) → LOW (~0.0–0.15).

That number flows into the already-shipped `scoreAgentic` composition unchanged.
So at **equal benchmark score**, an act-and-converge model out-ranks a narrate-only
model **for the local-autonomous use case** — while the default (non-agentic)
benchmark ranking is byte-identical (the agentic dimension is a separate
`agenticScore`, D4 of the agentic spec). This is the local-autonomous analogue of
ADR 0077's boundary: **benchmarks pre-filter the field; the harness judges agentic
fitness.**

**D2 — The head-to-head is the motivating evidence, encoded as the probe verdict.**
The decisive signal (act vs narrate) shows in a _single_ dispatch on one contained
task — the full staged workflow costs minutes-to-an-hour more for marginal signal.
The probe is therefore a **single-dispatch convergence micro-probe**, best-of-1,
judged by the task's own acceptance command. The automated probe reproduces the
manual head-to-head verdict: the narrator gets a LOW `buildQuality`, the builders a
HIGH one.

**D3 — Pure policy/scoring in `local-models`; injected I/O runner in
`orchestrator` (dependency inversion).** `local-models` owns the PURE parts and
depends only on interfaces:

- the `buildQuality` mapping (`scoreBuildQuality`),
- the cost-gating **policy** (`capability/probe-policy.ts`: `selectProbeTargets`,
  `isProbeDue`, `isCacheFresh`, `probeCacheKey`) — top-N, prefilter, cache, cadence,
- the adopter-portable task-suite schema + `DEFAULT_HARNESS_FIT_TASKS`,
- the `HarnessFitRunner` INTERFACE and the injected `HarnessFitCacheStore`.

The concrete runner — a single dispatch through an `OllamaBackend` + a throwaway
workspace + the acceptance gate, reading the recording stream for act-vs-narrate
metrics — is IMPLEMENTED in `orchestrator`
(`packages/orchestrator/src/agent/harness-fit-runner.ts`) and injected at the
composition root. The dependency points one way (`orchestrator → local-models`),
mirroring how `capability/agentic.ts` injects its `fetchImpl`. `local-models`
never imports `orchestrator`, so the pure policy stays unit-testable with fake
runner + fake cache + supplied clock, no live Ollama and no real disk.

**D4 — Cost gating: opt-in, benchmark-top-N, cadence, cache, prefilter.** A probe
is expensive (pull + run), so the policy NEVER probes the full discovered set. The
scheduler (`scheduler/refresh.ts`) probes only the benchmark **top-N** of the
ranked shortlist (default N=3), on a **cadence** (a due-check on a persisted
last-probe timestamp + interval — not every discovery refresh), skips candidates
that don't VRAM-fit or that confirmed `toolCalling === false` (already agentically
ineligible), and **caches** each `buildQuality` keyed by **model+version** (stable
until a new release; a fresh cache entry is not re-probed). The whole feature is
**opt-in** (`localModels.harnessFit.enabled`, default `false`) — disabled, the
ranking is byte-identical to the benchmark+heuristic rank.

**D5 — Fail-open everywhere.** A probe error/timeout/pull-failure leaves
`buildQuality` undefined → "no effect" → the ranker falls back to the
benchmark+heuristic rank; the pool is never blocked (matches the existing probe's
posture). The runner is fully guarded, the per-candidate probe loop is wrapped, and
the entire probe pass is wrapped in the scheduler so an unexpected throw still
leaves the tick running on the pre-probe ranking.

**D6 — Bounded by a wall-clock timeout (no hangs).** The scheduler awaits each probe
inline, so a hung model or a hanging `acceptanceCommand` would stall the whole refresh
tick. `maxTurns` bounds the turn COUNT but not wall time (the default backend inherits
600_000 ms/turn ⇒ ~2 h worst case). The runner therefore races the entire probe
(dispatch + acceptance) against an overall per-probe wall-clock timeout (default 5 min,
a constructor param); on timeout the acceptance spawn's process group is SIGKILLed and
the probe returns a fail-open `error: 'probe timed out'` result (→ `buildQuality`
undefined → no ranking effect).

**Composition-root wiring.** `Orchestrator.startRefreshScheduler` constructs the
injected seams and passes them to `runRefreshTick` as the `harnessFit` deps bundle ONLY
when `localModels.harnessFit.enabled`: the `HarnessFitProbeRunner`, a persistent
`HarnessFitCacheFileStore` under `~/.harness/local-models/` (buildQuality cache AND the
`getLastProbeAt`/`setLastProbeAt` cadence timestamp, mirroring `PoolStateStore`), and a
`createBuildQualityReRanker` binding that re-runs the SAME `createNativeRecommender`
ranker over the held candidate set with probed `buildQuality` threaded in (no
ranker-math duplication). Config→deps translation happens here (`cadenceMs → intervalMs`,
`taskIds → tasks`). Disabled/absent ⇒ no deps are passed and the tick is byte-identical.

## Consequences

- A narrate-only model that passes the tool-calling gate no longer out-ranks an
  act-and-converge model at equal benchmark score for autonomous dispatch — the
  exact `llama3.3:70b` failure the head-to-head exposed.
- **The benchmark↔harness-fit boundary is now explicit and must not be blurred.**
  Benchmarks (and the thin tool-calling/latency probe) pre-filter the field; the
  harness-fit probe judges _agentic build fitness_ empirically. Do not push
  benchmark heuristics into the probe, and do not try to reconstruct convergence
  from benchmarks — only the real harness produces that signal.
- The probe is a cost-gated, opt-in add-on: with it disabled the engine behaves
  exactly as before. Enabling it trades a bounded, cadenced probe budget for
  sharper local-autonomous selection.
- `local-models` remains free of an `orchestrator` dependency; the boundary is an
  interface + injected runner, keeping the pure policy deterministic and testable.
- The task suite ships with `local-models` and is adopter-portable (self-describing
  acceptance commands, no host-repo layout) so a probe runs in any adopter project.

## Alternatives rejected

- **Add a new ranker term for build quality.** The `buildQuality` slot already
  exists and `scoreAgentic` already composes it; adding a parallel term would fork
  the agentic scoring. Feeding the existing slot (D1) is the minimal, purpose-built
  change. Rejected.
- **Run the full staged workflow per candidate.** The act-vs-narrate signal is
  decisive in a single dispatch; the full staged run costs minutes-to-an-hour more
  for marginal extra signal. A single-dispatch micro-probe (D2) is the cheapest real
  signal. Rejected.
- **Probe the whole discovered set every refresh.** Cost-prohibitive (each probe is
  a pull + run). Top-N + cadence + cache + prefilter (D4) bound the cost to the
  benchmark leaders, occasionally. Rejected.
- **Implement the runner in `local-models`.** That would drag an `orchestrator`
  (backend + workspace + gate) dependency into `local-models`, inverting the
  dependency direction and making the pure policy untestable without live I/O. The
  interface + injected runner (D3) keeps the boundary clean. Rejected.
- **Fail closed on a probe error (block/penalize the candidate).** A probe failure
  is an infrastructure signal, not a quality signal; penalizing on it would let a
  flaky Ollama pull demote a good model. Fail-open (D5) — undefined `buildQuality`,
  no effect — matches the existing probe's posture. Rejected.
