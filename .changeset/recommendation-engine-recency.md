---
'@harness-engineering/local-models': minor
'@harness-engineering/orchestrator': minor
---

Recency-aware local-model discovery. Discovery is now a wide net: per approved org it merges HuggingFace `trending` (new/hot) with `downloads` (established), dedupes by model id, and caps at the per-org limit, then hands the union to the benchmark ranker — instead of pre-filtering by cumulative downloads, which crowded out brand-new leaders before they could be scored. A failing `trending` call falls back to `downloads` (discovery never breaks). The `allowedOrgs` allowlist gains `openai`, `zai-org`, `THUDM`, `moonshotai` so the current-leader orgs can be considered. The benchmark ranker is unchanged — this only widens what reaches it.
