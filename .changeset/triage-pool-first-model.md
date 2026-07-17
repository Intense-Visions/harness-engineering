---
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': minor
---

fix(triage): select the local model from the LMLM pool (reasoning-ranked), not the static config list

`harness roadmap triage` resolved its local model from `agent.backends.local.model[0]` — a
fixed, hand-maintained list — so triage could stay pinned to a weak model even after the Local
Model Lifecycle Manager pool had installed and ranked a stronger one. The live orchestrator does
not have this problem: its `LocalModelResolver` derives candidates from the pool via
`poolStateToCandidates(snapshot, profile)`. This brings the same pool-first pick to the one-shot
CLI triage path so the CLI and live agents agree on the model.

- The report/brainstorm now prefer the pool's top-ranked model for the **`reasoning`** profile
  (the triage gate's safety rests on reasoning-grade complexity judgment). In a real dogfood run,
  this flipped an item the weak model mis-read as `trivial`/dispatchable to a correct
  `moderate` → held-to-human — without any config change.
- The static `agent.backends.*.model` list remains the documented **fallback** for pool-less
  adopters and non-Ollama backends; a missing/empty/broken pool degrades to it silently (never an
  error). An explicit `--model` still wins; explicit cloud (`intelligence.provider`) backends
  ignore the local pool pick.
- Orchestrator now re-exports the pool-state primitives (`PoolStateStore`,
  `poolStateToCandidates`, `DEFAULT_POOL_STATE_PATH`, `PoolState`, `RankProfile`) so the CLI reads
  the persisted pool without a new CLI→local-models package edge.
