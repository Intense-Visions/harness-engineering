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
   - On refetch-and-compare conflict (synthesized `ConflictError` — GitHub REST does not honor `If-Match` on issue PATCH, so there is no real 412 on the wire; see ADR 0009 §Consequences), the route translates it to HTTP `409 TRACKER_CONFLICT` with the conflict diff in the body (Phase 4 decision D-P4-B)
   - On success, `appendHistory()` records the assignment event as a deduplicated issue comment (see ADR 0009)
   - Invalidates SSE caches (`roadmap`, `overview`)

5. **GitHub sync** — After the file lock releases, if the feature has a `github:owner/repo#number` external ID and `GITHUB_TOKEN` is set, the endpoint assigns the user on the GitHub issue via `POST /repos/{owner}/{repo}/issues/{number}/assignees`. In file-less mode, step 5 is a no-op because the tracker is already the source of truth — the assignment was written in step 4.

6. **Thread creation** — The client creates a new chat thread with the routed skill command and navigates to it. The feature name is passed as context for the skill session.

## Conflict UX (file-less mode)

When a file-less write returns HTTP `409 TRACKER_CONFLICT` (S3/S5/S6), the dashboard surfaces the conflict via a coordinated UX flow added in Phase 7:

1. **Recognize.** The client helper `fetchWithConflict` (in `src/client/utils/`) detects the body shape `{code: 'TRACKER_CONFLICT', externalId, conflictedWith, refreshHint}` and returns a discriminated union.
2. **Toast.** The losing caller pushes the conflict into `useToastStore` with `{externalId, conflictedWith}`. `ConflictToastRegion` (mounted on `Roadmap.tsx`) renders an `aria-live="polite"` toast: _"Claimed by @alice — refresh"_ (falls back to "another session" when `conflictedWith` is absent).
3. **Refetch.** The toast region's `onRefresh` callback fires `GET /api/roadmap` (`cache: 'no-store'`) and stores the result as a manual override on `Roadmap.tsx`. The next SSE tick clears the override.
4. **Scroll-to-row.** `scrollToFeatureRow(externalId)` runs after the refetch commits. It locates the `<FeatureRow data-external-id="...">` element, smooth-scrolls it into view, focuses it (`tabIndex=-1`), and applies `data-conflict-highlight="true"` for 2 seconds (pulse ring).
5. **Degraded fallback.** If no row matches the `externalId` after the refetch (issue deleted), the toast remains visible and no scroll happens. No error thrown.

### Endpoints emitting TRACKER_CONFLICT

| Endpoint                           | Source       | Symbol         |
| ---------------------------------- | ------------ | -------------- |
| `POST /api/actions/roadmap/claim`  | dashboard    | S3 (P4)        |
| `POST /api/actions/roadmap-status` | dashboard    | S5 (P4)        |
| `POST /api/roadmap/append`         | orchestrator | S6 (P7 D-P7-A) |

See ADR 0008 (tracker abstraction in core) and ADR 0009 §Consequences (refetch-and-compare vs `If-Match`) for the wire-level rationale.

## Key Files

- `packages/dashboard/src/server/identity.ts` — Identity resolution waterfall
- `packages/dashboard/src/server/routes/actions.ts` — Claim and identity endpoints; file-less branch in claim handler
- `packages/dashboard/src/client/components/roadmap/utils.ts` — Shared `isWorkable`, `detectWorkflow`, `externalIdToUrl`
- `packages/dashboard/src/client/components/roadmap/ClaimConfirmation.tsx` — Confirmation popover UI
- `packages/dashboard/src/client/components/roadmap/FeatureRow.tsx` — Feature row with "Start Working" button
- `packages/core/src/roadmap/tracker/factory.ts` — `createTrackerClient(config)` used by the file-less branch
- `packages/core/src/roadmap/load-tracker-client-config.ts` — `loadTrackerClientConfigFromProject(root)` canonical loader
