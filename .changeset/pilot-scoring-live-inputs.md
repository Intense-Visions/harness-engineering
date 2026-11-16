---
'@harness-engineering/core': patch
---

Roadmap pilot scoring: the `dependents` and `affinity` inputs now carry signal on a real roadmap (#2222). `dependents` counts the distinct not-done rows whose Blockers resolve to a candidate using the same matching rules as the eligibility filter (names, shard slugs, backticked slugs in prose, `#N` issue references), instead of keying on raw blocker prose. `affinity` treats a `done` row as completed by the current user when the user is its `Assignee` or the latest `assigned` history record names them (plus any explicit `completed` record), since nothing writes `completed` records in practice. Weights (0.5 / 0.3 / 0.2) and the priority-first two-tier sort are unchanged.
