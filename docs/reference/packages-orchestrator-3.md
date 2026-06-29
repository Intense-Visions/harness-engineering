# Reference: packages / orchestrator / 3

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/orchestrator/src/server/routes/local-model.ts

[`packages/orchestrator/src/server/routes/local-model.ts`](/packages/orchestrator/src/server/routes/local-model.ts)

Callback returning the latest LocalModelStatus snapshot, or null when no local backend is configured (cloud-only orchestrator).

**Exports:** `GetLocalModelStatusFn`, `handleLocalModelRoute`, `GetLocalModelStatusesFn`, `handleLocalModelsRoute`

## packages/orchestrator/src/server/routes/v1/events-sse.ts

[`packages/orchestrator/src/server/routes/v1/events-sse.ts`](/packages/orchestrator/src/server/routes/v1/events-sse.ts)

Event-bus topics the SSE handler subscribes to.

**Exports:** `SseEventLog`, `getSseEventLog`, `handleV1EventsSseRoute`

## packages/orchestrator/src/server/routes/v1/interactions-resolve.ts

[`packages/orchestrator/src/server/routes/v1/interactions-resolve.ts`](/packages/orchestrator/src/server/routes/v1/interactions-resolve.ts)

**Exports:** `handleV1InteractionsResolveRoute`

## packages/orchestrator/src/server/routes/v1/jobs-maintenance.ts

[`packages/orchestrator/src/server/routes/v1/jobs-maintenance.ts`](/packages/orchestrator/src/server/routes/v1/jobs-maintenance.ts)

**Exports:** `handleV1JobsMaintenanceRoute`

## packages/orchestrator/src/server/routes/v1/proposals.ts

[`packages/orchestrator/src/server/routes/v1/proposals.ts`](/packages/orchestrator/src/server/routes/v1/proposals.ts)

**Exports:** `handleV1ProposalsRoute`

## packages/orchestrator/src/server/routes/v1/routing.ts

[`packages/orchestrator/src/server/routes/v1/routing.ts`](/packages/orchestrator/src/server/routes/v1/routing.ts)

**Exports:** `RoutingRouteDeps`, `handleV1RoutingRoute`

## packages/orchestrator/src/server/v1-bridge-routes.ts

[`packages/orchestrator/src/server/v1-bridge-routes.ts`](/packages/orchestrator/src/server/v1-bridge-routes.ts)

Phase 3 (DELTA-SUG-1 carry-forward): single source of truth for v1-only bridge primitives.

**Exports:** `V1BridgeRoute`, `V1_BRIDGE_ROUTES`, `isV1Bridge`, `requiredBridgeScope`

## packages/orchestrator/src/sessions/archive-hooks.ts

[`packages/orchestrator/src/sessions/archive-hooks.ts`](/packages/orchestrator/src/sessions/archive-hooks.ts)

Session archive hook bundle.

**Exports:** `BuildArchiveHooksOptions`, `buildArchiveHooks`

## packages/orchestrator/src/sessions/search-index.ts

[`packages/orchestrator/src/sessions/search-index.ts`](/packages/orchestrator/src/sessions/search-index.ts)

Hermes Phase 1 — SQLite FTS5 session search index.

**Exports:** `IndexedDoc`, `SearchOptions`, `normalizeFts5Query`, `searchIndexPath`, `SqliteSearchIndex`, `openSearchIndex`, `indexSessionDirectory`, `reindexFromArchive`

## packages/orchestrator/src/sessions/summarize.ts

[`packages/orchestrator/src/sessions/summarize.ts`](/packages/orchestrator/src/sessions/summarize.ts)

LLM-driven session summary.

**Exports:** `SummarizeContext`, `SummarizeResult`, `truncateForBudget`, `renderLlmSummaryMarkdown`, `summarizeArchivedSession`, `isSummaryEnabled`

## packages/orchestrator/src/tracker/adapters/github-issues-issue-tracker.ts

[`packages/orchestrator/src/tracker/adapters/github-issues-issue-tracker.ts`](/packages/orchestrator/src/tracker/adapters/github-issues-issue-tracker.ts)

Phase 4 / S2: thin wrapper that exposes the orchestrator's small `IssueTrackerClient` interface (Phase 1, 6 methods) over the wide `RoadmapTrackerClient` interface (Phase 2, ~12 methods) from `@harness-engineering/core`.

**Exports:** `GitHubIssuesIssueTrackerAdapter`

## packages/orchestrator/src/workflow/skill-catalog.ts

[`packages/orchestrator/src/workflow/skill-catalog.ts`](/packages/orchestrator/src/workflow/skill-catalog.ts)

Spec B Phase 3: an entry in the local skill catalog.

**Exports:** `SkillCatalogEntry`, `discoverSkillCatalog`, `discoverSkillCatalogNames`

## packages/orchestrator/tests/helpers/noop-exec-file.ts

[`packages/orchestrator/tests/helpers/noop-exec-file.ts`](/packages/orchestrator/tests/helpers/noop-exec-file.ts)

A no-op `execFile` replacement for tests that construct real Orchestrator instances.

**Exports:** `noopExecFile`
