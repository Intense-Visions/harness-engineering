# Reference: packages / core / 4

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/core/src/shared/port.ts

[`packages/core/src/shared/port.ts`](/packages/core/src/shared/port.ts)

Ports the WHATWG fetch spec blocks at the network layer.

**Exports:** `WHATWG_BAD_PORTS`, `isBadPort`, `assertPortUsable`

## packages/core/src/solutions/scan-candidates/assemble.ts

[`packages/core/src/solutions/scan-candidates/assemble.ts`](/packages/core/src/solutions/scan-candidates/assemble.ts)

**Exports:** `suggestCategory`, `AssembleInput`, `assembleCandidateReport`

## packages/core/src/solutions/scan-candidates/cross-reference.ts

[`packages/core/src/solutions/scan-candidates/cross-reference.ts`](/packages/core/src/solutions/scan-candidates/cross-reference.ts)

**Exports:** `crossReferenceUndocumentedFixes`

## packages/core/src/solutions/scan-candidates/git-scan.ts

[`packages/core/src/solutions/scan-candidates/git-scan.ts`](/packages/core/src/solutions/scan-candidates/git-scan.ts)

**Exports:** `GitScanOptions`, `ScannedCommit`, `normalizeSince`, `gitScan`

## packages/core/src/solutions/scan-candidates/hotspot.ts

[`packages/core/src/solutions/scan-candidates/hotspot.ts`](/packages/core/src/solutions/scan-candidates/hotspot.ts)

**Exports:** `HotspotOptions`, `Hotspot`, `computeHotspots`

## packages/core/src/solutions/scan-candidates/iso-week.ts

[`packages/core/src/solutions/scan-candidates/iso-week.ts`](/packages/core/src/solutions/scan-candidates/iso-week.ts)

Compute ISO 8601 week number for a date.

**Exports:** `IsoWeek`, `isoWeek`, `formatIsoWeek`

## packages/core/src/state/event-sourcing/lane-machine.ts

[`packages/core/src/state/event-sourcing/lane-machine.ts`](/packages/core/src/state/event-sourcing/lane-machine.ts)

Phase 4: the pure task-lane state machine.

**Exports:** `TERMINAL_LANES`, `isTerminal`, `isAllowedTransition`, `dependencyGuard`, `evidenceGuard`, `ForceOpts`, `forceGuard`, `TransitionOpts`

## packages/core/src/state/event-sourcing/log.ts

[`packages/core/src/state/event-sourcing/log.ts`](/packages/core/src/state/event-sourcing/log.ts)

**Exports:** `EventLogOptions`, `EventLogPaths`, `eventLogPaths`, `readTailSeq`, `loadEvents`, `resetLocalCountersForTests`, `EmitResult`, `emitEvent`

## packages/core/src/state/event-sourcing/projections/audit.ts

[`packages/core/src/state/event-sourcing/projections/audit.ts`](/packages/core/src/state/event-sourcing/projections/audit.ts)

Phase 5: pure fold of audit events (user_input_captured + approval_requested + approval_resolved) into the append-only session audit trail (subsumes GH-580).

**Exports:** `AuditKind`, `AuditEntry`, `AuditProjection`, `projectAudit`, `formatAuditTimeline`

## packages/core/src/state/event-sourcing/projections/core-state.ts

[`packages/core/src/state/event-sourcing/projections/core-state.ts`](/packages/core/src/state/event-sourcing/projections/core-state.ts)

The legacy-shaped core-state view derived from the event log.

**Exports:** `CoreStateProjection`, `projectCoreState`, `toHarnessState`

## packages/core/src/state/event-sourcing/projections/lanes.ts

[`packages/core/src/state/event-sourcing/projections/lanes.ts`](/packages/core/src/state/event-sourcing/projections/lanes.ts)

Phase 4: pure fold of lane events (task_registered + lane_transitioned) into a per-task lane projection.

**Exports:** `LaneHistoryEntry`, `LaneRecord`, `LanesProjection`, `projectLanes`

## packages/core/src/state/event-sourcing/transition.ts

[`packages/core/src/state/event-sourcing/transition.ts`](/packages/core/src/state/event-sourcing/transition.ts)

Phase 4: the lane writers (IO).

**Exports:** `registerTask`, `transitionLane`

## packages/core/src/state/event-sourcing/writer-id.ts

[`packages/core/src/state/event-sourcing/writer-id.ts`](/packages/core/src/state/event-sourcing/writer-id.ts)

INV-1: a globally-unique, stable-per-process writer id.

**Exports:** `getWriterId`, `__resetWriterIdForTests`

## packages/core/src/strategy/writer.ts

[`packages/core/src/strategy/writer.ts`](/packages/core/src/strategy/writer.ts)

**Exports:** `WriteStrategyDocOptions`, `writeStrategyDoc`

## packages/core/src/telemetry/cache-metrics.ts

[`packages/core/src/telemetry/cache-metrics.ts`](/packages/core/src/telemetry/cache-metrics.ts)

CacheMetricsRecorder — in-memory ring buffer recording prompt-cache hits/misses per backend invocation.

**Exports:** `CacheMetricsRecorderOptions`, `CacheMetricsRecorder`

## packages/core/src/telemetry/exporter/otlp-http.ts

[`packages/core/src/telemetry/exporter/otlp-http.ts`](/packages/core/src/telemetry/exporter/otlp-http.ts)

OTLPExporter — hand-rolled OTLP/HTTP JSON exporter for trace spans.

**Exports:** `OTLPExporterOptions`, `OTLPExporter`

## packages/core/src/telemetry/trajectory.ts

[`packages/core/src/telemetry/trajectory.ts`](/packages/core/src/telemetry/trajectory.ts)

TrajectoryBuilder — joins `.harness/metrics/adoption.jsonl` records with an in-memory `AgentEvent[]` snapshot to produce a `TrajectoryMetadata` summary for a single session.

**Exports:** `TrajectoryBuilderInput`, `TrajectoryBuilder`

## packages/core/src/validation/branch.ts

[`packages/core/src/validation/branch.ts`](/packages/core/src/validation/branch.ts)

Allowed branch name prefixes

**Exports:** `BranchingConfig`, `BranchValidationResult`, `validateBranchName`
