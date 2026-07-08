---
'@harness-engineering/local-models': minor
'@harness-engineering/orchestrator': minor
---

feat(lmlm): wire pool bounds seed + candidate source so the Local Models cards populate

Completes the two deferred wiring gaps that left the dashboard's Pool and
Recommendations cards permanently empty when LMLM is enabled.

- **Pool bounds seed (Phase 1):** the orchestrator now applies the operator's
  configured `localModels.pool` bounds (disk budget + org/family allowlist) to
  the pool store on startup, after `PoolStateStore.load()` so declarative config
  wins over stale persisted bounds. Previously `PoolManager.configurePool()` had
  no caller and the pool defaulted to `diskBudgetGb: 0`, blocking every install.
- **Candidate source (Phase 2):** a new `candidates` module in
  `@harness-engineering/local-models` — a GGUF→`RankerCandidate` parser, a
  bundled human-curated frozen candidate snapshot (offline-safe, deterministic),
  and an allowlist-aware selector — feeds the recommender, which was previously
  constructed with an empty candidate list. Live HuggingFace discovery runs in a
  new on-demand `scripts/refresh-model-candidates.mjs` generator (fail-closed),
  never in CI.
