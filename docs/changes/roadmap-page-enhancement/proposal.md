# Roadmap Page Enhancement: Feature Table with Claim Workflow

## Overview

Transform the roadmap page from a chart-only view into a full dashboard representation of the project roadmap. Replace the synthetic Gantt chart with a milestone-grouped feature table showing all metadata (status, assignee, priority, spec, plan, blockers, external ID). Add a stats summary bar, inline "Start Working" action with confirmation popover, and smart routing to the appropriate harness skill based on feature state (no spec -> brainstorming, spec but no plan -> planning, plan exists -> execution). Claiming a feature updates `roadmap.md` (status + assignee) and syncs with the GitHub tracker.

## Goals

1. Surface all roadmap metadata that's currently only visible in `docs/roadmap.md`
2. Enable claiming unassigned features directly from the dashboard
3. Route claimed features to the correct harness workflow automatically
4. Keep the dashboard self-contained (no orchestrator dependency for claims)
5. Maintain the ProgressChart as the visual summary; remove the Gantt chart

## Decisions

| #   | Decision                                                                     | Rationale                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Replace Gantt chart with feature table                                       | Gantt bars are synthetic (fixed-width, no date data). A table communicates the same information plus full metadata. ProgressChart stays as the visual summary.                               |
| 2   | Smart routing based on feature state                                         | Routes to brainstorming (no spec), planning (spec, no plan), or execution (plan exists). Matches the existing harness workflow chain without requiring manual selection.                     |
| 3   | Feature table integrated with filters, not a separate "Pick Up Work" section | Avoids duplicating feature rows. A "Show workable only" filter toggle plus inline action buttons keeps the page cohesive.                                                                    |
| 4   | Confirmation popover before claiming                                         | Prevents misclicks, shows the detected workflow step, and gives the user a chance to review before status transition.                                                                        |
| 5   | Dedicated `/api/actions/roadmap/claim` endpoint                              | Atomic claim operation: updates `roadmap.md` (status -> in-progress, assignee -> GitHub username, timestamp), assigns GitHub issue. Clean separation from the existing status-only endpoint. |
| 6   | GitHub identity resolved server-side                                         | Dashboard server resolves the authenticated GitHub username via `GITHUB_TOKEN` or `gh` CLI. Returned to the client via a lightweight identity endpoint or embedded in SSE data.              |
| 7   | Dashboard chat thread on claim                                               | Clicking confirm creates a chat thread with the routed command and feature context pre-loaded. Uses the existing `RoadmapActionButton` / `createThread` pattern.                             |
| 8   | Milestone sections as collapsible accordions                                 | Groups features by milestone with expand/collapse. Matches the `## Milestone` / `### Feature` structure of `roadmap.md`.                                                                     |

## Technical Design

### Data Structures

No new types needed for the feature table -- `DashboardFeature` and `MilestoneProgress` already carry all required fields. Two small additions:

**Claim request/response:**

```typescript
// POST /api/actions/roadmap/claim
interface ClaimRequest {
  feature: string; // feature name (matches ### heading)
  assignee: string; // resolved GitHub username
}

interface ClaimResponse {
  ok: boolean;
  feature: string;
  status: 'in-progress';
  assignee: string;
  workflow: 'brainstorming' | 'planning' | 'execution';
  githubSynced: boolean; // whether external issue was also assigned
}
```

**Identity endpoint:**

```typescript
// GET /api/identity
interface IdentityResponse {
  username: string; // GitHub username (e.g. "chadjw")
  source: 'github-api' | 'gh-cli' | 'git-config'; // how it was resolved
}
```

### Smart Routing Logic

```typescript
function detectWorkflow(feature: DashboardFeature): 'brainstorming' | 'planning' | 'execution' {
  if (!feature.spec || feature.spec === 'none') return 'brainstorming';
  if (!feature.plan || feature.plan === '\u2014') return 'planning';
  return 'execution';
}

function workflowToCommand(workflow: string): string {
  switch (workflow) {
    case 'brainstorming':
      return 'harness:brainstorming';
    case 'planning':
      return 'harness:planning';
    case 'execution':
      return 'harness:execution';
  }
}
```

Note: `DashboardFeature` currently lacks `spec` and `plan` fields -- these exist on the core `RoadmapFeature` type but are stripped by the gatherer. The gatherer needs to pass them through for routing to work.

### Server-Side Claim Flow

1. Receive `ClaimRequest` with feature name and assignee
2. Acquire file lock on `roadmapPath` (reuse existing `withFileLock`)
3. `parseRoadmap()` -> find feature -> validate it's claimable (status is `planned` or `backlog`, assignee is null/empty)
4. Update feature: `status = 'in-progress'`, `assignee = request.assignee`, `updatedAt = now`
5. `serializeRoadmap()` -> write file
6. Invalidate `roadmap` and `overview` caches
7. If feature has `externalId` matching `github:*` pattern and `GITHUB_TOKEN` is set, assign the issue on GitHub via REST API
8. Return `ClaimResponse` with detected workflow

### GitHub Identity Resolution

Waterfall strategy, cached for the server lifetime:

1. `GITHUB_TOKEN` set -> call GitHub API `GET /user` -> extract `login`
2. No token -> shell out to `gh api user --jq .login`
3. Both fail -> fall back to `git config user.name`
4. All fail -> return error, claim endpoint returns 503

### Client Components

| Component           | Purpose                                                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StatsBar`          | Horizontal strip showing total/done/in-progress/planned/blocked/backlog counts from `RoadmapData`                                                                                                                                |
| `FeatureTable`      | Milestone-grouped accordion. Each milestone section is collapsible with a header showing milestone name and progress fraction. Feature rows show name, status badge, assignee, priority, summary (truncated).                    |
| `FeatureRow`        | Single row. Expandable to show spec link, plan link, external ID (clickable GitHub link), blockers, updated-at. Workable items show "Start Working" button.                                                                      |
| `ClaimConfirmation` | Popover anchored to the "Start Working" button. Shows feature name, detected workflow label, confirm/cancel buttons. On confirm: POST `/api/actions/roadmap/claim`, then create chat thread via `useThreadStore.createThread()`. |
| `AssignmentHistory` | Table at the bottom rendering the assignment history section from the roadmap.                                                                                                                                                   |

### File Layout

```
packages/dashboard/src/
  client/
    pages/Roadmap.tsx                    # Modified -- remove GanttChart, add new sections
    components/roadmap/
      StatsBar.tsx                        # New
      FeatureTable.tsx                    # New
      FeatureRow.tsx                      # New
      ClaimConfirmation.tsx              # New
      AssignmentHistory.tsx              # New
  server/
    routes/actions.ts                    # Extended -- new claim handler
    gather/roadmap.ts                   # Extended -- pass through spec/plan fields
    identity.ts                          # New -- GitHub identity resolution + cache
  shared/
    types.ts                             # Extended -- DashboardFeature gains spec/plan fields, new claim types
```

## Integration Points

### Entry Points

- **New API route:** `POST /api/actions/roadmap/claim` -- claim a feature with assignee and status transition
- **New API route:** `GET /api/identity` -- resolve the current user's GitHub identity
- **Modified SSE data:** `overview` event's `roadmap.features` gains `spec` and `plan` fields

### Registrations Required

- Both new routes registered in `buildActionsRouter()` in `packages/dashboard/src/server/routes/actions.ts`
- Identity route can live in the same actions router or a dedicated router -- same registration pattern
- No barrel export changes (dashboard is a standalone app, not a library)

### Documentation Updates

- None required -- the dashboard is an internal tool with no external-facing docs for individual pages

### Architectural Decisions

- **Use `parseRoadmap`/`serializeRoadmap` from core for claim mutations** -- the dashboard layer already depends on core (allowed by `harness.config.json` layer rules). This avoids duplicating the string-manipulation approach in the existing `handleRoadmapStatus` and ensures structural correctness.

### Knowledge Impact

- No new domain concepts. The claim workflow reuses existing concepts (feature status, assignee, tracker sync) and surfaces them in the UI.

## Success Criteria

1. **Stats bar renders accurate counts** -- Total, done, in-progress, planned, blocked, and backlog counts match the values computed by `gatherRoadmap()`
2. **All milestones render as collapsible sections** -- Each milestone from `roadmap.md` appears as a section header with expand/collapse, showing its features as table rows
3. **Feature rows display full metadata** -- Name, status badge, assignee, priority, and truncated summary visible in collapsed state. Spec link, plan link, external ID (clickable), blockers, and updated-at visible in expanded state
4. **Filters work across milestone, status, and workable-only** -- Milestone dropdown, status dropdown, and "workable only" toggle correctly narrow the displayed features
5. **"Start Working" button appears only on workable items** -- Features that are `planned` or `backlog` with no assignee show the button; all others do not
6. **Confirmation popover shows correct workflow** -- No spec -> "Brainstorming", spec but no plan -> "Planning", plan exists -> "Execution"
7. **Claiming updates `roadmap.md` atomically** -- After confirm, the roadmap file reflects `status: in-progress`, `assignee: <github-username>`, and `updatedAt: <timestamp>`
8. **GitHub issue assigned on claim** -- When the feature has an `externalId` and `GITHUB_TOKEN` is available, the corresponding GitHub issue is assigned to the user
9. **Chat thread opens with correct command** -- After claim, a new chat thread is created with the routed skill command and the feature name as context
10. **Gantt chart removed** -- `GanttChart` component and its import are no longer used on the roadmap page
11. **Assignment history table renders** -- The assignment history section from `roadmap.md` is displayed at the bottom of the page
12. **Identity resolution gracefully degrades** -- If GitHub API and `gh` CLI are unavailable, falls back to `git config user.name`. If all fail, the "Start Working" button is disabled with a tooltip explaining why

## Implementation Order

### Phase 1: Data Layer

- Extend `DashboardFeature` in `shared/types.ts` to include `spec` and `plan` fields
- Update `gatherRoadmap()` to pass through spec/plan from the parsed roadmap
- Add identity resolution module (`server/identity.ts`) with GitHub API -> `gh` CLI -> `git config` waterfall
- Add `GET /api/identity` route
- Add `POST /api/actions/roadmap/claim` route with file lock, `parseRoadmap`/`serializeRoadmap`, and GitHub issue assignment

### Phase 2: Client Components

- Build `StatsBar` component using counts already in `RoadmapData`
- Build `FeatureTable` with milestone accordion sections
- Build `FeatureRow` with collapsed/expanded states and status badges
- Build `ClaimConfirmation` popover with workflow detection display
- Build `AssignmentHistory` table

### Phase 3: Page Assembly

- Update `Roadmap.tsx`: remove `GanttChart` import and usage
- Wire in `StatsBar`, `FeatureTable`, `AssignmentHistory`
- Add "workable only" filter toggle alongside existing milestone/status filters
- Connect claim flow: popover confirm -> POST claim -> create chat thread -> navigate

### Phase 4: Polish & Edge Cases

- Handle identity resolution failure (disable "Start Working", show tooltip)
- Handle claim failures (feature already claimed, network error)
- Handle features with no `externalId` (skip GitHub sync silently)
- Verify SSE cache invalidation refreshes the page after claim
