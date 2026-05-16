---
'@harness-engineering/types': minor
---

Publish exports that landed in source without a corresponding version bump. `@harness-engineering/types@0.11.0` shipped without these symbols even though commits between 0.11.0 and now (`0db97708`, `40246b06`, `d1493fe6`, `9ba567b6`) added them to `src/index.ts`. Downstream packages (notably `@harness-engineering/orchestrator@0.4.3`) compiled their dist against the new exports and pinned `@harness-engineering/types@0.11.0`, so `npm install -g @harness-engineering/cli` resolves both at incompatible versions and the CLI fails at module load with `SyntaxError: The requested module '@harness-engineering/types' does not provide an export named 'AuthAuditEntrySchema'`.

New exports made available in this release:

- `AuthTokenSchema`, `AuthTokenPublicSchema`, `AuthAuditEntrySchema`, `TokenScopeSchema` and accompanying types (added in `0db97708`)
- `WebhookSubscriptionSchema`, `WebhookSubscriptionPublicSchema`, `GatewayEventSchema` (added in `40246b06`)
- `WebhookDeliverySchema`, `WebhookDeliveryStatusSchema` (added in `d1493fe6`)
- `TrajectoryMetadataSchema`, `PromptCacheStatsSchema`, `OTLPSpanSchema`, `OTLPKeyValueSchema` (added in `9ba567b6`)

Because `updateInternalDependencies` is `patch` in `.changeset/config.json`, every package that depends on `@harness-engineering/types` will receive a patch bump and a fresh dist when this release publishes, repairing the broken installs.
