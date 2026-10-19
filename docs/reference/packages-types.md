# Reference: packages / types

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/types/src/**type_tests**/routing-types.test-d.ts

[`packages/types/src/__type_tests__/routing-types.test-d.ts`](/packages/types/src/__type_tests__/routing-types.test-d.ts)

Spec B Phase 0 — typecheck-only fixture.

## packages/types/src/**type_tests**/stats-types.test-d.ts

[`packages/types/src/__type_tests__/stats-types.test-d.ts`](/packages/types/src/__type_tests__/stats-types.test-d.ts)

stats-explore-exploit Phase 1 — typecheck-only fixture asserting the shared bandit/SPRT shapes compile as the spec's data structures describe.

## packages/types/src/auth.ts

[`packages/types/src/auth.ts`](/packages/types/src/auth.ts)

Scope vocabulary for Gateway API tokens.

**Exports:** `TokenScopeSchema`, `TokenScope`, `BridgeKindSchema`, `BridgeKind`, `AuthTokenSchema`, `AuthToken`, `AuthTokenPublicSchema`, `AuthTokenPublic`

## packages/types/src/local-models.ts

[`packages/types/src/local-models.ts`](/packages/types/src/local-models.ts)

Local Model Lifecycle Manager (LMLM) — configuration types.

**Exports:** `LocalModelsPlatform`, `LocalModelsInstallerBackend`, `LocalModelsHardwareOverride`, `LocalModelsPoolConfig`, `LocalModelsRefreshConfig`, `LocalModelsInstallerConfig`, `LocalModelsConfig`

## packages/types/src/notifications.ts

[`packages/types/src/notifications.ts`](/packages/types/src/notifications.ts)

Notification sink kinds shipped in tree.

**Exports:** `NotificationSinkKindSchema`, `NotificationSinkKind`, `NotificationSeveritySchema`, `NotificationSeverity`, `NotificationActionSchema`, `NotificationAction`, `NotificationEnvelopeSchema`, `NotificationEnvelope`

## packages/types/src/proposals.ts

[`packages/types/src/proposals.ts`](/packages/types/src/proposals.ts)

Provenance taxonomy for skills in the catalog.

**Exports:** `SkillProvenanceSchema`, `SkillProvenance`, `ProposalKindSchema`, `ProposalKind`, `ProposalStatusSchema`, `ProposalStatus`, `ProposalGateFindingSchema`, `ProposalGateFinding`

## packages/types/src/pulse.ts

[`packages/types/src/pulse.ts`](/packages/types/src/pulse.ts)

Pulse config — read-side observability config block under `pulse:` in `harness.config.json`.

**Exports:** `PulseDbSource`, `PulseSources`, `PulseConfig`, `SanitizedResult`, `SanitizeFn`, `PulseWindow`, `PulseAdapter`, `PulseRunStatusType`

## packages/types/src/solutions.ts

[`packages/types/src/solutions.ts`](/packages/types/src/solutions.ts)

Solution-doc frontmatter contract.

**Exports:** `SolutionTrack`, `BugTrackCategory`, `KnowledgeTrackCategory`, `SolutionCategory`, `SolutionDocFrontmatter`

## packages/types/src/stats.ts

[`packages/types/src/stats.ts`](/packages/types/src/stats.ts)

Shared shapes for `@harness-engineering/stats` and its consumers: one bandit ledger line (`Pull`), the folded per-arm posterior (`ArmState`), bandit policy configuration, the chosen arm with its printable reason, and the SPRT config and verdict.

**Exports:** `Pull`, `ArmState`, `BanditConfig`, `Choice`, `SprtVerdict`, `SprtConfig`

## packages/types/src/strategy.ts

[`packages/types/src/strategy.ts`](/packages/types/src/strategy.ts)

STRATEGY.md contract — repo-root strategic anchor read by harness-strategy, harness-ideate, harness-brainstorming, and harness-roadmap-pilot.

**Exports:** `StrategyFrontmatter`, `REQUIRED_STRATEGY_SECTIONS`, `RequiredStrategySection`, `OPTIONAL_STRATEGY_SECTIONS`, `OptionalStrategySection`, `StrategySectionName`, `StrategySection`, `StrategyDoc`
