---
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': patch
---

fix(orchestrator): wire the AMR config-file surface — accept backend `capabilities` + `routing.policy`

AMR's types (`BackendDef.capabilities`, `RoutingConfig.policy`) and the engine that
reads them shipped, but the config-file Zod validators were never extended, so a
config carrying them was **rejected** ("Unrecognized key(s)") by both `harness
validate` and the orchestrator loader — you could not enable AMR from
`harness.config.json` / `harness.orchestrator.md` at all (only via the runtime
`PUT /api/v1/routing/policy` endpoint). The AMR guide's config-file example was
therefore aspirational.

- `BackendDefSchema` gains an optional `capabilities` (`BackendCapabilitiesSchema`:
  tier / costPer1kTokens / privacyClass / contextWindow / vision? / toolUse?),
  `.strict()` so config typos fail loudly.
- `RoutingConfigSchema` gains an optional `policy` (`RoutingPolicySchema`).
- The `PUT /routing/policy` route now **imports** the canonical `RoutingPolicySchema`
  instead of its own copy, so the config-file and HTTP-endpoint validation can never
  drift again. (The route-local copy had a 3-value `privacyFloor` enum, silently
  **missing `pooled-isolated`** — now fixed as a side effect.)
- Additive + default-off: a config without `capabilities`/`policy` validates and
  behaves byte-identically. A compile-time guard + a full-config `validateWorkflowConfig`
  round-trip test (the front door that was never exercised) pin the fix.
