---
slug: "lmlm-pool-consumption"
milestone: "Intake"
order: 4
---

### LMLM: pool consumption improvements (make installed models live, task-aware, self-correcting)

- **Status:** planned
- **Spec:** docs/changes/lmlm-pool-consumption/proposal.md
- **Summary:** The LMLM install side is solid (async install + progress, resumable pulls, restart recovery, lineage scoring — PRs #775, #777), but the consumption side is pull-based and static, so an installed model barely gets used. Five phased improvements: (1) **Freshness loop** — the resolver subscribes to the `local-models:pool` event (today it only polls, `local-model-resolver.ts:260`) and the analysis provider resolves its model lazily instead of freezing at pipeline build (`analysis-provider-factory.ts:147`); (2) **Score-seed** — a new pool entry starts `currentScore: 0`, so the model you explicitly installed sits at the bottom of the score-sorted candidate list until re-rank; seed it from the ranked/interpolated score; (3) **Runtime feedback** — stamp `lastUsedAt` on real inference (LRU eviction currently runs on stale data) + a failure circuit-breaker; (4) **Task-aware selection** — per-profile pool scores (`general`/`coding`/`reasoning`) + a `RoutingUseCase → profile` map so each task gets the best-fit pooled model instead of one top-scored model per backend (advances the Agent Autonomy metric; carries a standalone ADR); (5) **Warming** — warm the selected model into VRAM (`keep_alive`) to avoid first-request cold-start. Additive schema only (`PoolEntry.scoresByProfile`, absolute score on `ModelProposalContent`). Does NOT depend on live-HF candidate discovery — scores the models already in the pool.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** —
