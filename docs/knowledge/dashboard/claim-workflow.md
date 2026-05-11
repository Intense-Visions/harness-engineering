---
type: business_process
domain: dashboard
tags: [roadmap, claim, identity, github, smart-routing, workflow]
---

# Roadmap Claim Workflow

The claim workflow allows a user to pick an unassigned roadmap feature from the dashboard and begin working on it. The process is atomic: a single action updates the local roadmap file, syncs with the external tracker, and opens the appropriate harness skill session.

## Flow

1. **Identity resolution** — On page load, the dashboard fetches `GET /api/identity` to resolve the current user's GitHub username. Uses a server-side waterfall: GitHub API (`GITHUB_TOKEN`) → `gh` CLI → `git config user.name`. Cached for server lifetime. If all methods fail, the "Start Working" button is disabled with a tooltip.

2. **Feature selection** — The roadmap page displays features in a milestone-grouped table. Features with status `planned` or `backlog` and no assignee show a "Start Working" button.

3. **Workflow detection** — When the user clicks "Start Working", a confirmation popover displays the detected workflow based on feature state:
   - No spec (or spec is `none`/em-dash) → **Brainstorming** (`harness:brainstorming`)
   - Spec exists but no plan → **Planning** (`harness:planning`)
   - Both spec and plan exist → **Execution** (`harness:execution`)

4. **Claim execution** — On confirm, the dashboard POSTs to `/api/actions/roadmap/claim`. The server branches on `roadmap.mode`:

   **File-backed mode** (default):
   - Acquires file lock on `docs/roadmap.md`
   - Parses roadmap via `parseRoadmap()` from `@harness-engineering/core`
   - Validates feature is claimable (correct status, no existing assignee)
   - Sets `status: in-progress`, `assignee: <github-username>`, `updatedAt: <now>`
   - Appends to assignment history
   - Serializes and writes via `serializeRoadmap()`
   - Invalidates SSE caches (`roadmap`, `overview`)

   **File-less mode** (`roadmap.mode: "file-less"`):
   - Resolves a tracker client via `createTrackerClient(loadTrackerClientConfigFromProject(root))` from `@harness-engineering/core`
   - Calls `client.claim(externalId, githubUsername, ifMatch)` with the cached ETag from the prior fetch
   - On 412 / refetch-and-compare conflict, the adapter returns `ConflictError`; the route translates it to HTTP `409 TRACKER_CONFLICT` with the conflict diff in the body (Phase 4 decision D-P4-B)
   - On success, `appendHistory()` records the assignment event as a deduplicated issue comment (see ADR 0009)
   - Invalidates SSE caches (`roadmap`, `overview`)

5. **GitHub sync** — After the file lock releases, if the feature has a `github:owner/repo#number` external ID and `GITHUB_TOKEN` is set, the endpoint assigns the user on the GitHub issue via `POST /repos/{owner}/{repo}/issues/{number}/assignees`. In file-less mode, step 5 is a no-op because the tracker is already the source of truth — the assignment was written in step 4.

6. **Thread creation** — The client creates a new chat thread with the routed skill command and navigates to it. The feature name is passed as context for the skill session.

## Key Files

- `packages/dashboard/src/server/identity.ts` — Identity resolution waterfall
- `packages/dashboard/src/server/routes/actions.ts` — Claim and identity endpoints; file-less branch in claim handler
- `packages/dashboard/src/client/components/roadmap/utils.ts` — Shared `isWorkable`, `detectWorkflow`, `externalIdToUrl`
- `packages/dashboard/src/client/components/roadmap/ClaimConfirmation.tsx` — Confirmation popover UI
- `packages/dashboard/src/client/components/roadmap/FeatureRow.tsx` — Feature row with "Start Working" button
- `packages/core/src/roadmap/tracker/factory.ts` — `createTrackerClient(config)` used by the file-less branch
- `packages/core/src/roadmap/load-tracker-client-config.ts` — `loadTrackerClientConfigFromProject(root)` canonical loader
