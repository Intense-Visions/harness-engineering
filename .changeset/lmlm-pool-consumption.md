---
'@harness-engineering/intelligence': minor
'@harness-engineering/local-models': minor
'@harness-engineering/orchestrator': minor
---

feat(lmlm): consume pooled models freshly — event-driven refresh, live analysis model, score-seed, runtime feedback, task-aware selection, warming

The pool install side was fast, but consumption was pull-based and static: a
newly installed model wasn't used by agents for up to a poll cycle and by the
analysis pipeline never (until restart), a fresh entry sat at `currentScore: 0`,
runtime outcomes didn't feed back, and selection ignored the ranker's per-task
profiles. This wires the pool through to inference.

- **Freshness loop** — `LocalModelResolver.refresh()` debounce-re-probes on a
  `local-models:pool` mutation, so an install/swap is resolvable in seconds. The
  analysis provider reads its model live per request (`getModel` seam) instead of
  snapshotting once at construction, unless the operator pinned a layer model.
- **Score-seed** — an installed pool entry seeds `currentScore` from its ranked
  score rather than `0`, so an explicitly-installed model isn't buried until the
  next re-rank.
- **Runtime feedback** — `lastUsedAt` is stamped on real inference; a model that
  fails N consecutive inferences is deprioritized until it recovers.
- **Task-aware selection** — per-profile pool scoring (general/coding/reasoning)
  routes each use-case to its best-fit pooled model, degrading to composite score
  when the benchmark snapshot lacks profile tags.
- **Warming** — the resolver best-effort warms a newly selected model
  (`keep_alive`) so the next dispatch isn't a cold start.

See `docs/changes/lmlm-pool-consumption/proposal.md` and the task-aware selection
ADR under `docs/knowledge/decisions/`.
