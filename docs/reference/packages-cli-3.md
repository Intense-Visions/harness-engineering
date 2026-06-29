# Reference: packages / cli / 3

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/commands/check-harness-strength.ts

[`packages/cli/src/commands/check-harness-strength.ts`](/packages/cli/src/commands/check-harness-strength.ts)

**Exports:** `CheckHarnessStrengthResult`, `runCheckHarnessStrength`, `createCheckHarnessStrengthCommand`

## packages/cli/src/commands/compound/scan-candidates.ts

[`packages/cli/src/commands/compound/scan-candidates.ts`](/packages/cli/src/commands/compound/scan-candidates.ts)

**Exports:** `ScanCandidatesOptions`, `ScanCandidatesStatus`, `runCompoundScanCandidatesCommand`, `createScanCandidatesCommand`

## packages/cli/src/commands/copy-craft.ts

[`packages/cli/src/commands/copy-craft.ts`](/packages/cli/src/commands/copy-craft.ts)

`harness copy-craft` — CLI entry for copy-craft (craft-pipeline #5).

**Exports:** `createCopyCraftCommand`

## packages/cli/src/commands/design-pipeline.ts

[`packages/cli/src/commands/design-pipeline.ts`](/packages/cli/src/commands/design-pipeline.ts)

`harness design-pipeline` — CLI entry for the orchestrator skill (design-pipeline sub-project #5, the last sub-project).

**Exports:** `createDesignPipelineCommand`

## packages/cli/src/commands/gateway/deliveries.ts

[`packages/cli/src/commands/gateway/deliveries.ts`](/packages/cli/src/commands/gateway/deliveries.ts)

**Exports:** `runDeliveriesList`, `runDeliveriesRetry`, `PurgeOptions`, `PurgeRunOptions`, `runDeliveriesPurge`, `createDeliveriesCommand`

## packages/cli/src/commands/gateway/token.ts

[`packages/cli/src/commands/gateway/token.ts`](/packages/cli/src/commands/gateway/token.ts)

**Exports:** `runTokenCreate`, `runTokenList`, `runTokenRevoke`, `createTokenCommand`

## packages/cli/src/commands/graph/ingest-options.ts

[`packages/cli/src/commands/graph/ingest-options.ts`](/packages/cli/src/commands/graph/ingest-options.ts)

**Exports:** `loadIngestOptions`

## packages/cli/src/commands/insights.ts

[`packages/cli/src/commands/insights.ts`](/packages/cli/src/commands/insights.ts)

Hermes Phase 1 — `harness insights` CLI: composite project report.

**Exports:** `createInsightsCommand`

## packages/cli/src/commands/knowledge-craft.ts

[`packages/cli/src/commands/knowledge-craft.ts`](/packages/cli/src/commands/knowledge-craft.ts)

`harness knowledge-craft` — CLI entry for knowledge-craft (craft-pipeline #9).

**Exports:** `createKnowledgeCraftCommand`

## packages/cli/src/commands/maintenance-config.ts

[`packages/cli/src/commands/maintenance-config.ts`](/packages/cli/src/commands/maintenance-config.ts)

Shared maintenance task-resolution helpers used by BOTH the `maintenance` command surface (`list`) and the on-demand `maintenance run` engine.

**Exports:** `loadMaintenanceConfig`, `loadAgentBackends`, `mergeResolvedTasks`

## packages/cli/src/commands/maintenance-run.ts

[`packages/cli/src/commands/maintenance-run.ts`](/packages/cli/src/commands/maintenance-run.ts)

On-demand maintenance pipeline (Phase 3) — the `harness maintenance run` engine.

**Exports:** `ResolveBackend`, `makeResolveBackend`, `resolveHarnessSpawn`, `createCheckRunner`, `createCommandExecutor`, `createFixDispatcher`, `buildTaskRunner`, `loadRunHistory`

## packages/cli/src/commands/mcp-guard.ts

[`packages/cli/src/commands/mcp-guard.ts`](/packages/cli/src/commands/mcp-guard.ts)

Hermes Phase 2 — Pre-launch OSV malware guard for MCP/npx packages.

**Exports:** `extractNpmPackages`, `parseNpmSpec`, `GuardCheckOptions`, `GuardCheckResult`, `runMcpGuardCheck`, `createMcpGuardCommand`

## packages/cli/src/commands/migrate-backends.ts

[`packages/cli/src/commands/migrate-backends.ts`](/packages/cli/src/commands/migrate-backends.ts)

One-shot migration: copy `agent.backends` (and `agent.routing` when present) from harness.orchestrator.md into harness.config.json so the craft selector and the orchestrator share a single source of truth.

**Exports:** `runMigrateBackends`, `createBackendsSubcommand`

## packages/cli/src/commands/models.ts

[`packages/cli/src/commands/models.ts`](/packages/cli/src/commands/models.ts)

`harness models` command group.

**Exports:** `runModelsProbe`, `createModelsCommand`

## packages/cli/src/commands/naming-craft.ts

[`packages/cli/src/commands/naming-craft.ts`](/packages/cli/src/commands/naming-craft.ts)

`harness naming-craft` — CLI entry for naming-craft (craft-pipeline #1).

**Exports:** `createNamingCraftCommand`

## packages/cli/src/commands/proposals.ts

[`packages/cli/src/commands/proposals.ts`](/packages/cli/src/commands/proposals.ts)

**Exports:** `runProposalsList`, `runProposalsShow`, `runProposalsReject`, `createProposalsCommand`

## packages/cli/src/commands/review-ci-local-adapter.ts

[`packages/cli/src/commands/review-ci-local-adapter.ts`](/packages/cli/src/commands/review-ci-local-adapter.ts)

Zod schema mirroring core's `ReviewFinding` so the openai-compatible provider returns structured output that re-serializes into the `{ assessment, findings }` shape core's `parseLocalVerdict` consumes.

**Exports:** `createLocalInvoke`

## packages/cli/src/commands/review-ci.ts

[`packages/cli/src/commands/review-ci.ts`](/packages/cli/src/commands/review-ci.ts)

**Exports:** `assertKnownRunner`, `RunGit`, `resolveDiffRange`, `buildDiffInfo`, `ReviewCiOptions`, `runReviewCi`, `buildReviewBody`, `PostReview`
