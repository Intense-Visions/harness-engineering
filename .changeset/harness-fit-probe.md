---
'@harness-engineering/local-models': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
'@harness-engineering/cli': minor
---

feat(local-models): harness-fit probe — empirical agentic evidence for model recommendation

The local-model recommender ranks candidates by benchmark evidence plus a thin
agentic probe that only checks _"can the model emit a `tool_call`?"_ and _"is one
turn fast enough?"_. A live 3-way head-to-head proved this necessary-but-insufficient
for autonomous coding: `llama3.3:70b` **passes** the tool-calling gate and is fast,
yet it **narrated instead of acting** (one tool call, no artifact, gate never green),
while the smaller `gpt-oss:20b`/`qwen3.6:27b` **acted and converged**. No benchmark or
thin-probe signal predicted that — only running the real harness did.

The **harness-fit probe** supplies the missing empirical evidence. It runs a
benchmark-shortlisted candidate through a small contained coding task **on the real
harness**, judges convergence (the task's own acceptance command) plus act-vs-narrate
metrics from the recording stream, and maps them to a coarse `buildQuality ∈ [0, 1]`
(converged → HIGH, acted-not-converged → MID, narrated → LOW). That number feeds the
**already-wired** `buildQuality` slot in the `agenticScore` composition — **no
ranker-math change** — so at equal benchmark score an act-and-converge model out-ranks
a narrate-only one for autonomous dispatch, while the default `score` ordering is
untouched.

- **Pure policy + injected runner (dependency inversion).** `local-models` owns the
  pure parts — the `buildQuality` mapping (`scoreBuildQuality`), the cost-gating policy
  (`selectProbeTargets` / `isProbeDue` / `isCacheFresh` / `probeCacheKey`), the portable
  task-suite schema + `DEFAULT_HARNESS_FIT_TASKS`, and the `HarnessFitRunner` interface.
  The concrete single-dispatch runner (Ollama backend + throwaway workspace + acceptance
  gate, reading the stream for act-vs-narrate metrics) is implemented in the orchestrator
  and injected at the composition root, so `local-models` never depends on the orchestrator.
- **Single-dispatch convergence micro-probe.** The act-vs-narrate signal is decisive in
  one dispatch; best-of-1, cheapest real signal.
- **Cost-gated (opt-in, top-N, cadence, cache, prefilter).** Disabled by default
  (`localModels.harnessFit.enabled`). When enabled, only the benchmark top-N are probed
  (never the full set), on a cadence (not every refresh), with `buildQuality` cached by
  model+version and VRAM-unfit / `toolCalling:false` candidates prefiltered out.
- **Fail-open everywhere.** Any probe error/timeout/pull-failure leaves `buildQuality`
  undefined ⇒ no ranking effect; the refresh is never broken and the pool is never blocked.
- **Config surface.** New optional `localModels.harnessFit` block (added to both the TS
  type and the Zod schema so it survives config parse) — `enabled`, `topN`, `cadenceMs`,
  `cacheTtlMs`, optional `taskIds`. Adopter-portable probe tasks self-describe their
  acceptance command, so a probe runs in any adopter project.
- **Wired at the composition root (the probe actually fires).** `startRefreshScheduler`
  constructs the `HarnessFitProbeRunner`, a persistent `HarnessFitCacheFileStore` under
  `~/.harness/local-models/` (buildQuality cache + cadence timestamp), and a
  `reRankWithBuildQuality` binding that re-runs the SAME ranker over the held candidate
  set with probed `buildQuality` threaded in — passing them as the tick's `harnessFit`
  deps ONLY when `localModels.harnessFit.enabled` (config→deps translation:
  `cadenceMs → intervalMs`, `taskIds → tasks`). Disabled/absent ⇒ no deps are passed and
  the tick is byte-identical to before.
- **Bounded (no hangs).** The runner enforces an overall per-probe wall-clock timeout
  (default 5 min) around both the dispatch and the acceptance-command spawn — `maxTurns`
  bounds turn count but not wall time, so a hung model or hanging acceptance is aborted
  into a fail-open `error` result instead of blocking the refresh tick.
- **Converged-without-artifact is suspect.** A converged verdict only scores HIGH when the
  model actually touched a file; a trivially-passing acceptance with no artifact drops to
  MID/LOW rather than earning the top band.

See ADR 0081 (harness-fit probe: benchmarks pre-filter, the harness judges agentic fitness).
