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

## packages/dashboard/src/client/hooks/useRole.tsx

[`packages/dashboard/src/client/hooks/useRole.tsx`](/packages/dashboard/src/client/hooks/useRole.tsx)

React context that resolves and persists the presentation-only dashboard role — a stored `localStorage` preference wins, else the server's `/api/identity` role, else `dev` — and exposes a `ready` flag so role-aware landing does not flash the wrong lane.

**Exports:** `RoleProvider`, `useRole`

## packages/dashboard/src/client/pages/LocalModels.tsx

[`packages/dashboard/src/client/pages/LocalModels.tsx`](/packages/dashboard/src/client/pages/LocalModels.tsx)

The `/s/local-models` operator page: composes the hardware, pool, and recommendations cards over the single `useLocalModelsPanel` data hook, lets each card degrade independently, and collapses to one "LMLM disabled" banner when every read route is disabled.

**Exports:** `LocalModels`

## packages/dashboard/src/client/pages/Signoff.tsx

[`packages/dashboard/src/client/pages/Signoff.tsx`](/packages/dashboard/src/client/pages/Signoff.tsx)

UAT sign-off page — renders a change's acceptance basis as a per-item checklist, collects a disposition and optional note per item plus an overall decision and signer identity, gates submit on a complete human decision, and records it via `POST /api/signoff`.

**Exports:** `Signoff`

## packages/dashboard/src/client/types/roles.ts

[`packages/dashboard/src/client/types/roles.ts`](/packages/dashboard/src/client/types/roles.ts)

Groups the flat `SYSTEM_PAGES` registry into per-role navigation lanes and picks each role's default landing route; re-exports the shared role taxonomy so client code has a single import site.

**Exports:** `DASHBOARD_ROLES`, `DEFAULT_ROLE`, `coerceRole`, `isDashboardRole`, `DashboardRole`, `SystemPageEntry`, `RoleLane`, `ROLE_LANES`, `laneForRole`, `pagesForRole`, `defaultRouteForRole`

## packages/dashboard/src/server/gather/signoff.ts

[`packages/dashboard/src/server/gather/signoff.ts`](/packages/dashboard/src/server/gather/signoff.ts)

Read/write helpers behind the UAT sign-off routes: resolves the acceptance basis from `docs/changes/<slug>/proposal.md` (Success Criteria, soft-degrading to User-Visible Behavior then Overview), reads any existing sign-off, and renders/writes the co-located `signoff.md`.

**Exports:** `proposalRelPath`, `signoffRelPath`, `gatherSignoffBasis`, `readExistingSignoff`, `renderSignoffMarkdown`, `writeSignoffMarkdown`

## packages/dashboard/src/server/routes/signoff.ts

[`packages/dashboard/src/server/routes/signoff.ts`](/packages/dashboard/src/server/routes/signoff.ts)

Hono router for `GET /api/signoff/:slug` (acceptance basis) and `POST /api/signoff` (record a decision) — constrains the slug to a traversal-safe charset, serializes writes per artifact path with a file lock, and records through the same `UatSignoffRecorder` the `uat_signoff` MCP tool uses.

**Exports:** `buildSignoffRouter`

## packages/dashboard/src/shared/roles.ts

[`packages/dashboard/src/shared/roles.ts`](/packages/dashboard/src/shared/roles.ts)

The dashboard role taxonomy (`dev` / `pm-ba` / `client`) shared by server identity resolution and client navigation — canonical order, default role, type guard, and a coercion that falls back to the default.

**Exports:** `DashboardRole`, `DASHBOARD_ROLES`, `DEFAULT_ROLE`, `isDashboardRole`, `coerceRole`
