# Reference: packages / core / 2

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/core/src/review/ci/parsers/antigravity.ts

[`packages/core/src/review/ci/parsers/antigravity.ts`](/packages/core/src/review/ci/parsers/antigravity.ts)

The inner verdict antigravity emits as plain-text JSON on stdout.

**Exports:** `parseAntigravityVerdict`

## packages/core/src/review/ci/parsers/codex.ts

[`packages/core/src/review/ci/parsers/codex.ts`](/packages/core/src/review/ci/parsers/codex.ts)

A single event line in the `codex exec --json` JSONL stream.

**Exports:** `parseCodexVerdict`

## packages/core/src/review/ci/runner-presets.ts

[`packages/core/src/review/ci/runner-presets.ts`](/packages/core/src/review/ci/runner-presets.ts)

**Exports:** `HeadlessInvocation`, `LocalEndpointInvoke`, `AgentCliPreset`, `EndpointPreset`, `RunnerPreset`, `AgentCliRunnerId`, `EndpointRunnerId`, `RunnerId`

## packages/core/src/review/ci/verdict-schema.ts

[`packages/core/src/review/ci/verdict-schema.ts`](/packages/core/src/review/ci/verdict-schema.ts)

Schema version for CiReviewVerdict.

**Exports:** `CI_REVIEW_VERDICT_SCHEMA_VERSION`, `CI_RUNNERS`, `CiRunner`, `CI_ASSESSMENTS`, `CI_REVIEW_DOMAINS`, `deriveBlockingFindings`, `deriveExitCode`, `CiReviewVerdictSchema`

## packages/core/src/review/depth-calibrator.ts

[`packages/core/src/review/depth-calibrator.ts`](/packages/core/src/review/depth-calibrator.ts)

Depth calibration tier.

**Exports:** `ReviewDepth`, `ConditionalSubagent`, `RISK_KEYWORDS`, `countChangedLines`, `detectRiskKeywords`, `computeDepth`, `DepthCalibration`, `computeActivations`

## packages/core/src/roadmap/assignee-lifecycle.ts

[`packages/core/src/roadmap/assignee-lifecycle.ts`](/packages/core/src/roadmap/assignee-lifecycle.ts)

The assignee lifecycle authority.

**Exports:** `isMachineAssignee`, `assigneeInvariantHolds`, `pushAssigneeToExternal`, `isClaimableBy`, `claim`, `release`, `setStatus`

## packages/core/src/roadmap/external-id.ts

[`packages/core/src/roadmap/external-id.ts`](/packages/core/src/roadmap/external-id.ts)

Canonical External-ID (`github:owner/repo#NNN`) parse/build helpers.

**Exports:** `parseExternalId`, `buildExternalId`

## packages/core/src/roadmap/load-mode.ts

[`packages/core/src/roadmap/load-mode.ts`](/packages/core/src/roadmap/load-mode.ts)

Resolve the project's roadmap mode from `<projectRoot>/harness.config.json`.

**Exports:** `loadProjectRoadmapMode`, `RoadmapStorageMode`, `detectRoadmapStorageMode`

## packages/core/src/roadmap/load-tracker-client-config.ts

[`packages/core/src/roadmap/load-tracker-client-config.ts`](/packages/core/src/roadmap/load-tracker-client-config.ts)

**Exports:** `loadTrackerClientConfigFromProject`

## packages/core/src/roadmap/migrate/body-diff.ts

[`packages/core/src/roadmap/migrate/body-diff.ts`](/packages/core/src/roadmap/migrate/body-diff.ts)

Field-by-field canonical comparison.

**Exports:** `bodyMetaMatches`

## packages/core/src/roadmap/migrate/history-hash.ts

[`packages/core/src/roadmap/migrate/history-hash.ts`](/packages/core/src/roadmap/migrate/history-hash.ts)

Normalize an event timestamp to second-granularity ISO-8601 for stable hashing.

**Exports:** `hashHistoryEvent`, `parseHashFromCommentBody`, `buildHistoryCommentBody`

## packages/core/src/roadmap/migrate/plan-builder.ts

[`packages/core/src/roadmap/migrate/plan-builder.ts`](/packages/core/src/roadmap/migrate/plan-builder.ts)

**Exports:** `buildMigrationPlan`

## packages/core/src/roadmap/mode.ts

[`packages/core/src/roadmap/mode.ts`](/packages/core/src/roadmap/mode.ts)

Roadmap storage mode.

**Exports:** `RoadmapMode`, `RoadmapModeConfig`, `getRoadmapMode`

## packages/core/src/roadmap/pilot-scoring-file-less.ts

[`packages/core/src/roadmap/pilot-scoring-file-less.ts`](/packages/core/src/roadmap/pilot-scoring-file-less.ts)

**Exports:** `FileLessScoredCandidate`, `scoreRoadmapCandidatesFileLess`

## packages/core/src/roadmap/promote.ts

[`packages/core/src/roadmap/promote.ts`](/packages/core/src/roadmap/promote.ts)

Promote a brainstormed feature from `backlog` to `planned` and link its spec.

**Exports:** `RoadmapPromoteArgs`, `RoadmapPromoteTransition`, `RoadmapPromoteCoreResult`, `RoadmapPromoteResult`, `RoadmapPromoteRowDecision`, `decidePromotionForRow`, `promoteFeature`

## packages/core/src/roadmap/reconcile.ts

[`packages/core/src/roadmap/reconcile.ts`](/packages/core/src/roadmap/reconcile.ts)

**Exports:** `ReconcileResult`, `reconcileDoneFromClosedIssues`

## packages/core/src/roadmap/store/apply-diff.ts

[`packages/core/src/roadmap/store/apply-diff.ts`](/packages/core/src/roadmap/store/apply-diff.ts)

**Exports:** `applyRoadmapDiff`

## packages/core/src/roadmap/store/assembler.ts

[`packages/core/src/roadmap/store/assembler.ts`](/packages/core/src/roadmap/store/assembler.ts)

Assemble shards + `_meta` into an in-memory `Roadmap`.

**Exports:** `assembleRoadmap`
