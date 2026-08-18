---
'@harness-engineering/orchestrator': patch
---

chore(cleanup): remove dead orchestrator/agent exports. Un-export three intra-file-only symbols (`SUBPROCESS_ENV_ALLOWLIST` and `SUBPROCESS_ENV_ALLOWED_PREFIXES` in `subprocess-env.ts`, `useCaseToProfile` in `local-model-resolver.ts`, and the abstract base class `ServerlessBackend` in `backends/serverless.ts`) and delete the unused `createRuntime` factory in `runtime/index.ts`. Pure dead-code removal; no behavior change.
