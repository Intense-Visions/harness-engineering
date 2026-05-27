---
'@harness-engineering/orchestrator': minor
---

Re-export workflow Zod schemas (`BackendDefSchema`, `RoutingConfigSchema`, `RoutingValueSchema`) and local-model probe primitives (`defaultFetchModels`, `normalizeLocalModel`, `LocalModelResolver`, `LocalModelResolverOptions`, `ResolverLogger`) so the cli's unified craft LLM provider config and the craft skill family can validate `agent.backends` / `agent.routing` and resolve `/v1/models` against the same source of truth the orchestrator runtime uses. Additive API surface only.
