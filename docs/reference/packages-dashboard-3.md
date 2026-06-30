# Reference: packages / dashboard / 3

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/dashboard/src/client/utils/local-model-statuses.ts

[`packages/dashboard/src/client/utils/local-model-statuses.ts`](/packages/dashboard/src/client/utils/local-model-statuses.ts)

Upsert a single local-model status into the previous array, keyed by `backendName`.

**Exports:** `mergeLocalModelStatusByName`, `mergeLocalModelStatusesFromHttp`

## packages/dashboard/src/client/utils/phase-presentation.ts

[`packages/dashboard/src/client/utils/phase-presentation.ts`](/packages/dashboard/src/client/utils/phase-presentation.ts)

Shared presentation helpers for orchestrator run-attempt phases.

**Exports:** `PHASE_COLORS`, `phaseColor`, `formatElapsed`

## packages/dashboard/src/client/utils/scrollToFeatureRow.ts

[`packages/dashboard/src/client/utils/scrollToFeatureRow.ts`](/packages/dashboard/src/client/utils/scrollToFeatureRow.ts)

Locates a FeatureRow by its data-external-id attribute, smooth-scrolls it into view, focuses it, and applies a `data-conflict-highlight` attribute (for `CONFLICT_PULSE_MS` milliseconds) that CSS animates as a pulse ring.

**Exports:** `scrollToFeatureRow`

## packages/dashboard/src/server/routes/actions-claim-file-less.ts

[`packages/dashboard/src/server/routes/actions-claim-file-less.ts`](/packages/dashboard/src/server/routes/actions-claim-file-less.ts)

Phase 4 / S3 + S5: file-less branches of the dashboard claim and roadmap-status endpoints.

**Exports:** `JsonResponder`, `ClaimFileLessBody`, `RoadmapStatusFileLessBody`, `handleClaimFileLess`, `handleRoadmapStatusFileLess`

## packages/dashboard/src/server/signals/command-runner.ts

[`packages/dashboard/src/server/signals/command-runner.ts`](/packages/dashboard/src/server/signals/command-runner.ts)

Injectable runner for shelling out to git/gh.

**Exports:** `CommandRunner`, `defaultCommandRunner`

## packages/dashboard/src/server/signals/providers/baseline-updates.ts

[`packages/dashboard/src/server/signals/providers/baseline-updates.ts`](/packages/dashboard/src/server/signals/providers/baseline-updates.ts)

**Exports:** `baselineUpdatesProvider`

## packages/dashboard/src/server/signals/providers/complexity-trend.ts

[`packages/dashboard/src/server/signals/providers/complexity-trend.ts`](/packages/dashboard/src/server/signals/providers/complexity-trend.ts)

**Exports:** `complexityTrendProvider`

## packages/dashboard/src/server/signals/providers/coverage-trend.ts

[`packages/dashboard/src/server/signals/providers/coverage-trend.ts`](/packages/dashboard/src/server/signals/providers/coverage-trend.ts)

**Exports:** `coverageTrendProvider`

## packages/dashboard/src/server/signals/providers/eval-fail-rate.ts

[`packages/dashboard/src/server/signals/providers/eval-fail-rate.ts`](/packages/dashboard/src/server/signals/providers/eval-fail-rate.ts)

**Exports:** `evalFailRateProvider`

## packages/dashboard/src/server/signals/providers/pr-review.ts

[`packages/dashboard/src/server/signals/providers/pr-review.ts`](/packages/dashboard/src/server/signals/providers/pr-review.ts)

**Exports:** `prReviewProvider`

## packages/dashboard/src/server/signals/timeline-store.ts

[`packages/dashboard/src/server/signals/timeline-store.ts`](/packages/dashboard/src/server/signals/timeline-store.ts)

**Exports:** `SignalTimelineStore`
