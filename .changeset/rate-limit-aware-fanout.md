---
'@harness-engineering/core': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

Rate-limit-aware fan-out (#1532): add a per-resource API budget primitive
(`RateBudget` + `sharedRateBudget` in `@harness-engineering/core` `fleet/rate-budget`)
with shared cross-leaf backoff and typed `ThrottledFetchError` / `TruncatedFetchError`.
The GitHub HTTP layer (`GitHubHttp`) now acquires the shared budget before every
fetch, penalizes it on 403/429, and FAILS the leaf on a terminal throttle or a
server-truncated page instead of returning partial/silent-zero data. Adopters tune
budgets via the new `AgentConfig.resourceBudgets` config key (defaulted in
`getDefaultConfig`, applied to the shared budget at orchestrator startup).
