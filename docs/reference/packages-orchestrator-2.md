# Reference: packages / orchestrator / 2

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/orchestrator/src/gateway/openapi/v1-registry.ts

[`packages/orchestrator/src/gateway/openapi/v1-registry.ts`](/packages/orchestrator/src/gateway/openapi/v1-registry.ts)

**Exports:** `buildV1Registry`, `buildV1Document`

## packages/orchestrator/src/gateway/telemetry/fanout.ts

[`packages/orchestrator/src/gateway/telemetry/fanout.ts`](/packages/orchestrator/src/gateway/telemetry/fanout.ts)

**Exports:** `MaintenanceStartedPayload`, `MaintenanceCompletedPayload`, `MaintenanceErrorPayload`, `SkillInvocationPayload`, `DispatchDecisionPayload`, `MAX_ACTIVE_RUNS`, `ActiveRunRegistry`, `wireTelemetryFanout`

## packages/orchestrator/src/gateway/webhooks/queue.ts

[`packages/orchestrator/src/gateway/webhooks/queue.ts`](/packages/orchestrator/src/gateway/webhooks/queue.ts)

**Exports:** `RETRY_DELAYS_MS`, `MAX_ATTEMPTS`, `QueueInsertInput`, `QueueRow`, `QueueStats`, `WebhookQueue`

## packages/orchestrator/src/gateway/webhooks/store.ts

[`packages/orchestrator/src/gateway/webhooks/store.ts`](/packages/orchestrator/src/gateway/webhooks/store.ts)

**Exports:** `CreateSubscriptionInput`, `WebhookStore`

## packages/orchestrator/src/maintenance/agent-dispatcher.ts

[`packages/orchestrator/src/maintenance/agent-dispatcher.ts`](/packages/orchestrator/src/maintenance/agent-dispatcher.ts)

Dependencies for {@link createAgentDispatcher}.

**Exports:** `AgentDispatcherDeps`, `createAgentDispatcher`

## packages/orchestrator/src/maintenance/check-runner.ts

[`packages/orchestrator/src/maintenance/check-runner.ts`](/packages/orchestrator/src/maintenance/check-runner.ts)

Shared spawn+parse+timeout core for maintenance `checkCommand` execution.

**Exports:** `MAINTENANCE_CHECK_MAX_BUFFER`, `MAINTENANCE_CHECK_TIMEOUT_MS`, `HarnessSpawn`, `ExecFileError`, `ExecFileAsyncFn`, `RunHarnessCheckOptions`, `isCheckTimeoutError`, `runHarnessCheck`

## packages/orchestrator/src/maintenance/check-script-runner.ts

[`packages/orchestrator/src/maintenance/check-script-runner.ts`](/packages/orchestrator/src/maintenance/check-script-runner.ts)

**Exports:** `CheckScriptResult`, `CheckScriptStatusEnvelope`, `CheckScriptRunner`, `parseStatusEnvelope`

## packages/orchestrator/src/maintenance/context-resolver.ts

[`packages/orchestrator/src/maintenance/context-resolver.ts`](/packages/orchestrator/src/maintenance/context-resolver.ts)

Hermes Phase 2 — Reads an inline-skill body by name.

**Exports:** `InlineSkillReader`, `ContextResolverOptions`, `ContextResolver`

## packages/orchestrator/src/maintenance/custom-task-validator.ts

[`packages/orchestrator/src/maintenance/custom-task-validator.ts`](/packages/orchestrator/src/maintenance/custom-task-validator.ts)

Hermes Phase 2 — Validation errors surfaced by `validateCustomTasks`.

**Exports:** `CustomTaskValidationError`, `CustomTaskValidatorDeps`, `validateCustomTasks`

## packages/orchestrator/src/maintenance/leader-elector.ts

[`packages/orchestrator/src/maintenance/leader-elector.ts`](/packages/orchestrator/src/maintenance/leader-elector.ts)

Decides which orchestrator instance is responsible for running scheduled maintenance tasks.

**Exports:** `LeaderElector`, `SingleProcessLeaderElector`

## packages/orchestrator/src/maintenance/output-store.ts

[`packages/orchestrator/src/maintenance/output-store.ts`](/packages/orchestrator/src/maintenance/output-store.ts)

**Exports:** `PersistedOutputEntry`, `TaskOutputStoreOptions`, `TaskOutputStore`

## packages/orchestrator/src/maintenance/overdue.ts

[`packages/orchestrator/src/maintenance/overdue.ts`](/packages/orchestrator/src/maintenance/overdue.ts)

Backward look-back window, in days.

**Exports:** `previousFireTime`, `TaskSelectionFilter`, `selectTasks`

## packages/orchestrator/src/maintenance/sync-main.ts

[`packages/orchestrator/src/maintenance/sync-main.ts`](/packages/orchestrator/src/maintenance/sync-main.ts)

Function signature compatible with Node's `child_process.execFile`.

**Exports:** `ExecFileFn`, `SyncSkipReason`, `SyncMainResult`, `SyncMainOptions`, `syncMain`

## packages/orchestrator/src/notifications/slack-sink.ts

[`packages/orchestrator/src/notifications/slack-sink.ts`](/packages/orchestrator/src/notifications/slack-sink.ts)

**Exports:** `SlackSinkOptions`, `SlackSink`

## packages/orchestrator/src/proposals/gate.ts

[`packages/orchestrator/src/proposals/gate.ts`](/packages/orchestrator/src/proposals/gate.ts)

Phase 4 gate (degraded mode, see spec D5).

**Exports:** `GateRunError`, `GateResult`, `runGate`

## packages/orchestrator/src/proposals/promote.ts

[`packages/orchestrator/src/proposals/promote.ts`](/packages/orchestrator/src/proposals/promote.ts)

**Exports:** `GateNotReadyError`, `PromotionError`, `PromotionResult`, `promote`

## packages/orchestrator/src/routing/decision-bus.ts

[`packages/orchestrator/src/routing/decision-bus.ts`](/packages/orchestrator/src/routing/decision-bus.ts)

**Exports:** `RoutingDecisionBusFilter`, `RoutingDecisionBusOptions`, `RoutingDecisionBus`

## packages/orchestrator/src/server/routes/auth.ts

[`packages/orchestrator/src/server/routes/auth.ts`](/packages/orchestrator/src/server/routes/auth.ts)

**Exports:** `handleAuthRoute`
