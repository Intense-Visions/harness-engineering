# @harness-engineering/dashboard

## 0.6.4

### Patch Changes

- Updated dependencies [48e0b5b]
  - @harness-engineering/types@0.12.0
  - @harness-engineering/core@0.26.2
  - @harness-engineering/orchestrator@0.4.4

## 0.6.3

### Patch Changes

- Updated dependencies [7ae0561]
  - @harness-engineering/core@0.26.1
  - @harness-engineering/orchestrator@0.4.3

## 0.6.2

### Patch Changes

- Updated dependencies [bed30c4]
- Updated dependencies [56176cd]
  - @harness-engineering/core@0.26.0

## 0.6.1

### Patch Changes

- 38fa742: fix(dashboard,orchestrator): surface `err.cause` in proxy 502s and reject WHATWG bad ports at startup (#287)

  The dashboard proxy was returning opaque `Orchestrator proxy error: fetch failed` 502s for every request when the orchestrator listened on a port the WHATWG fetch spec marks as "bad" (e.g. `10080`, `6000`, `6666`). `curl` does not enforce the bad-ports list, so the port appeared reachable from the shell — turning a one-line config fix into a multi-hour goose chase (see issue #287).

  **`@harness-engineering/core`:**
  - New `shared/port.ts` exports `WHATWG_BAD_PORTS` (frozen canonical list from [the fetch spec](https://fetch.spec.whatwg.org/#port-blocking)), `isBadPort(port)`, and `assertPortUsable(port, label?)`. `assertPortUsable` throws a clear, actionable error directing the user to choose a different port and linking the spec.

  **`@harness-engineering/dashboard`:**
  - `orchestrator-proxy.ts`: extracted `formatProxyErrorMessage(err)` that surfaces `err.cause.message` / `err.cause.code` alongside the base message. A `fetch failed` from a bad port now reads `Orchestrator proxy error: fetch failed (cause: bad port)`; `ECONNREFUSED`, `ENOTFOUND`, etc. are visible the same way.
  - `getOrchestratorTarget()` logs a one-time `console.error` at resolution time if the configured target port is on the bad-ports list, so the failure mode is announced at startup rather than only per-request.
  - `serve.ts`: calls `assertPortUsable(port, 'dashboard API')` before `serve()` so the dashboard refuses to start on an unreachable port.

  **`@harness-engineering/orchestrator`:**
  - `server/http.ts#start()`: calls `assertPortUsable(this.port, 'orchestrator')` before `httpServer.listen()` so the orchestrator refuses to start on a bad port. The `harness orchestrator start` flow now fails loudly with a clear message instead of starting, appearing healthy to `curl`, and silently breaking every dashboard request.

- Updated dependencies [38fa742]
- Updated dependencies [bb7658b]
  - @harness-engineering/core@0.25.0
  - @harness-engineering/graph@0.9.0

## 0.6.0

### Minor Changes

- ed16b44: feat(roadmap): dashboard conflict UX for file-less roadmap mode (Phase 7 — file-less GA blocker)

  Closes the last file-less GA blocker by making HTTP 409 `TRACKER_CONFLICT` responses a first-class, accessible UX surface in the dashboard, and aligning the orchestrator's `roadmap-append` endpoint to emit the same conflict shape as the dashboard's claim endpoints (REV-P4-4, Option A).

  **`@harness-engineering/dashboard`:**
  - New `TrackerConflictBody` type, `isTrackerConflictBody` guard, and exported `CONFLICT_TOAST_TEMPLATE` constant in `src/shared/types.ts`.
  - New Zustand `toastStore` (`src/client/stores/toastStore.ts`) with single-toast supersession via a monotonic `seq` counter so repeat conflicts always re-trigger the refresh effect.
  - New `fetchWithConflict` helper (`src/client/utils/fetchWithConflict.ts`) returning a discriminated-union `{ ok: true, data } | { ok: false, status, conflict?, error? }` so every caller of an endpoint that can emit TRACKER_CONFLICT (S3, S5, S6) dispatches identically.
  - New `scrollToFeatureRow` helper (`src/client/utils/scrollToFeatureRow.ts`): smooth-scrolls the contested row into the viewport, focuses it, and applies a 2-second `data-conflict-highlight` pulse-ring (degraded fallback when the row is no longer in the DOM).
  - New `ConflictToastRegion` component (`src/client/components/ConflictToastRegion.tsx`) with `role="status"`, `aria-live="polite"`, `aria-atomic="true"`, and an explicit Dismiss button.
  - `FeatureRow` now exposes `data-external-id="<externalId>"` and `tabIndex={-1}` on its root element so the conflict resolver can locate and focus the contested row without lifting refs.
  - `ClaimConfirmation` recognizes the TRACKER_CONFLICT shape: dispatches a toast event, closes via `onCancel`, and never invokes `onConfirm` on conflict.
  - `Analyze.tsx`'s "Add to roadmap" path is routed through a new `appendToRoadmap` helper that uses `fetchWithConflict`, so an S6 conflict surfaces via the same toast pathway.
  - `Roadmap.tsx` mounts `ConflictToastRegion`, handles the refetch via `GET /api/roadmap` with `cache: 'no-store'`, dispatches the override into a `refreshedData` state, and drives the smooth-scroll-and-focus on the next animation frame; the manual override is cleared on the next SSE `lastUpdated` tick so live updates resume.
  - CSS keyframes fallback for `data-conflict-highlight` ring animation in `index.css`.

  **`@harness-engineering/orchestrator`:**
  - `roadmap-append` (S6) now translates `ConflictError` from `client.create()` into HTTP `409 { error, code: 'TRACKER_CONFLICT', externalId, conflictedWith, refreshHint: 'reload-roadmap' }` (D-P7-A). Previously it emitted a generic 502. This closes REV-P4-4 by giving the dashboard a single uniform conflict shape across S3 (`/api/actions/roadmap/claim`), S5 (`/api/actions/roadmap-status`), and S6 (`/api/roadmap/append`).

  **Documentation:**
  - `docs/knowledge/dashboard/claim-workflow.md` gains a "Conflict UX" section describing the toast, auto-refetch, and scroll-to-row choreography for the file-less branch (step 4).

  **Roadmap status:** With Phase 7 landed, the `tracker-only` roadmap (file-less mode) is feature-complete; manual browser verification of the toast, screen-reader announcement, focus, and pulse-ring is operator-side QA.

### Patch Changes

- Updated dependencies [287ca16]
  - @harness-engineering/core@0.24.0

## 0.5.2

### Patch Changes

- Updated dependencies [ba8da2e]
- Updated dependencies [54d9494]
- Updated dependencies [a1df67e]
  - @harness-engineering/core@0.23.8

## 0.5.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0
  - @harness-engineering/core@0.23.7

## 0.5.0

### Minor Changes

- 8825aee: Local model fallback (Spec 1)

  `agent.localModel` may now be an array of model names; `LocalModelResolver` probes the configured local backend on a fixed interval and resolves the first available model from the list. Status is broadcast via WebSocket (`local-model:status`) and exposed at `GET /api/v1/local-model/status`. The dashboard surfaces an unhealthy-resolver banner on the Orchestrator page via the `useLocalModelStatus` hook.
  - **`@harness-engineering/types`** — `LocalModelStatus` type; `localModel` widened to `string | string[]`.
  - **`@harness-engineering/orchestrator`** — `LocalModelResolver` (probe lifecycle, idempotent loop, request timeout, overlap guard); `getModel` callback threaded through `LocalBackend` and `PiBackend` so backends read the resolved model at session/turn time instead of from raw config; `createAnalysisProvider` local branch routed through the resolver; `GET /api/v1/local-model/status` route and `local-model:status` WebSocket broadcast.
  - **`@harness-engineering/dashboard`** — `useLocalModelStatus` hook (WebSocket primary, HTTP fallback); `LocalModelBanner` rendered on the Orchestrator page when the resolver reports unhealthy.

- 8825aee: Multi-backend routing (Spec 2)

  The orchestrator now accepts a named `agent.backends` map and a per-use-case `agent.routing` map, replacing the single `agent.backend` / `agent.localBackend` pair. Routable use cases: `default`, four scope tiers (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), and two intelligence layers (`intelligence.sel`, `intelligence.pesl`). Multi-local configurations are supported with one `LocalModelResolver` per backend. A single-runner dispatch path replaces the dual-runner split.
  - **`@harness-engineering/types`** — `BackendDef` union (`local` | `pi` | external types), `RoutingConfig`, `NamedLocalModelStatus`.
  - **`@harness-engineering/orchestrator`** — `BackendDefSchema` and `RoutingConfigSchema` (Zod); `migrateAgentConfig` shim for legacy `agent.backend` / `agent.localBackend` (warn-once at startup); `createBackend` factory; `BackendRouter` (use-case → backend resolution with intelligence-layer fallback); `AnalysisProviderFactory` (routed `BackendDef` → `AnalysisProvider`, distinct PESL provider); `OrchestratorBackendFactory` wrapping router + factory + container; `validateWorkflowConfig` SC15 enforcement; `Map<name, LocalModelResolver>` with per-resolver `NamedLocalModelStatus` broadcast; `GET /api/v1/local-models/status` array endpoint (singular `/local-model/status` retained as deprecated alias); `PiBackend` `timeoutMs` plumbed via `AbortController`.
  - **`@harness-engineering/intelligence`** — `IntelligencePipeline` accepts a distinct `peslProvider` so the SEL and PESL layers can resolve to different backends.
  - **`@harness-engineering/dashboard`** — `useLocalModelStatuses` (renamed from singular) consumes `/api/v1/local-models/status` and merges `NamedLocalModelStatus[]` by `backendName`; the Orchestrator page renders one `LocalModelBanner` per unhealthy backend.

  **Deprecation:** `agent.backend` and `agent.localBackend` continue to work via the migration shim, which synthesizes `agent.backends.primary` / `agent.backends.local` plus a `routing` map mirroring `escalation.autoExecute`. Hard removal lands in a follow-up release per ADR 0005.

### Patch Changes

- Updated dependencies [8825aee]
- Updated dependencies [8825aee]
  - @harness-engineering/types@0.11.0
  - @harness-engineering/core@0.23.6

## 0.4.1

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1
  - @harness-engineering/core@0.23.5

## 0.4.0

### Minor Changes

- 3bfe4e4: feat(dashboard): specialized skill-result views and chat session improvements.
  - Specialized result views per skill render structured output (status, artifacts, decisions, follow-up actions) instead of raw JSON dumps.
  - Interaction buttons (Approve / Revise / Stop) wired into the chat surface so confirmation flows complete in-product without copy-paste.
  - Fix: chat sessions now persist across page navigation and full reload (previously lost on route change).

### Patch Changes

- Updated dependencies [3bfe4e4]
  - @harness-engineering/graph@0.7.0
  - @harness-engineering/core@0.23.4

## 0.3.0

### Minor Changes

- Roadmap page enhancement: feature table with claim workflow
  - **Feature table** — Replace synthetic Gantt chart with milestone-grouped collapsible feature table showing full metadata (status, assignee, priority, spec, plan, blockers, external ID, updated-at)
  - **Stats bar** — Horizontal summary strip with total/done/in-progress/planned/blocked/needs-human/backlog counts
  - **Claim workflow** — Inline "Start Working" button on unassigned planned/backlog features with confirmation popover showing smart-routed workflow (brainstorming/planning/execution based on feature state)
  - **Identity resolution** — Server-side GitHub identity waterfall (GitHub API → gh CLI → git config) cached for server lifetime, exposed via `GET /api/identity`
  - **Claim endpoint** — `POST /api/actions/roadmap/claim` atomically updates roadmap.md (status, assignee, timestamp), syncs GitHub issue assignment, and returns detected workflow
  - **Assignment history** — Table rendering the assignment history section from roadmap.md
  - **needs-human status** — Full support across gatherer, types, StatsBar, and ProgressChart
  - **Shared utilities** — Extracted `isWorkable`, `detectWorkflow`, `externalIdToUrl`, `EM_DASH` into `roadmap/utils.ts`
  - **Dead code removal** — Deleted unused `GanttChart.tsx` (112 lines)
  - **Test coverage** — 68 new tests across 7 test files (identity waterfall, claim endpoint, 5 client components)

## 0.2.2

### Minor Changes

- Chat-first dashboard rewrite — thread-centric messaging-app layout
  - **Thread architecture** — Five thread types (chat, attention, analysis, agent, system) with Zustand ThreadStore, right context panel for live session state
  - **Two-column layout** — Persistent chat column alongside content area
  - **Attention-driven triage feed** — Replace KPI-wall overview with actionable triage items
  - **Domain pill navigation** — Expandable domain-grouped navigation replacing 13 flat nav items
  - **Route migration** — Domain-prefixed routes (`/s/roadmap`, `/t/:threadId`) with legacy redirects
  - **Agent thread enrichment** — Issue title, stats, stream history in agent threads
  - **Deep ocean theme** — Bioluminescent organisms, plankton particles, sidebar branding
  - **New pages** — Maintenance, Streams, Decay Trends, Traceability

### Patch Changes

- Fix zustand selector stabilization to prevent infinite re-render loop
- Show full analysis breakdown in attention BriefingCard
- Add knowledge pipeline to skill registry
- Add structural type guards for parsed WebSocket/SSE messages
- Performance: React.memo on dashboard rows, HTTP rate limiting
- Fix maintenance proxy, graceful shutdown, and atomic state writes
- Remove dead Chat page and ChatPanelTrigger components
- Updated dependencies
  - @harness-engineering/graph@0.6.0
  - @harness-engineering/core@0.23.3

## 0.2.1

### Patch Changes

- e3dc2e7: Add runtime validation for JSON.parse calls flagged by security scan
  - orchestrator: validate persisted maintenance history with Zod schema instead of bare Array.isArray check
  - dashboard: add structural type guards (object + discriminator check) before casting parsed WebSocket/SSE messages

## 0.2.0

### Minor Changes

- f62d6ab: Chat and agent stream UX improvements
  - Add jump to top and jump to bottom buttons to chat and agent streams
  - Virtualize AgentStreamDrawer with react-virtuoso for large stream performance
  - Add roadmap action buttons and commandArgs support
  - Add sticky auto-scroll to chat and agent stream views

- f62d6ab: Neural organism evolution and chat navigation polish
  - Evolving neural organism with genome, mitosis, and long-session vitality
  - Polish NeuralOrganism with Disney animation principles
  - Refine neural organism animation — softer, slower, more organic
  - Increase NeuralOrganism size across chat UI
  - Polish chat navigation and neural organism evolution

### Patch Changes

- f62d6ab: Chat rendering and session fixes
  - Derive drawer agent from live snapshot so session stats update in real time
  - Fix chat stream rendering and integrate NeuralOrganism
  - Remove unreachable thinking branch and fix lint errors
  - Preserve newlines in chat block rendering
  - Prevent chat session cross-pollination and redundant tab creation
  - Improve interaction tools UI, fix duplicate text rendering, and adjust whitespace formatting

- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/core@0.23.2
  - @harness-engineering/types@0.10.1

## 0.1.9

### Patch Changes

- fix: guard `localStorage.getItem()` in `useChatPanel` module-level init to prevent crash in test environments where `window` exists but `localStorage` is not a function

## 0.1.8

### Patch Changes

- 69624ba: Fix Neural Uplink chat not rendering messages or responding to skill execution

  **Root causes (3 compounding issues):**
  1. **MessageStream invisible due to zero height** — The Virtuoso virtual list container used `flex-1` but its parent was not a flex container, so the list collapsed to 0px height. Messages existed in state but had no pixels to render into. Fixed by switching to `h-full`.

  2. **First chat turn sent unrecognized sessionId** — The dashboard sent its locally-generated UUID as `sessionId` on every turn. The orchestrator interpreted this as a `--resume` request for a non-existent Claude CLI session, which exited immediately with no output. Fixed by omitting `sessionId` on first turn and capturing the orchestrator's returned session ID via the `onSession` SSE callback for subsequent turns.

  3. **Stale activeSessionId from localStorage** — `handleSkillSelect` checked `activeSessionId` (persisted in localStorage) to decide between creating or updating a session. When the ID pointed to a session no longer in the array, `updateSession` was a silent no-op. Fixed by always creating a fresh session on skill selection, and cleaning up stale IDs on session fetch.

  **Additional improvements:**
  - Added `orchestratorSessionId` field to `ChatSession` for proper multi-turn conversation support
  - Added visible error banner when `/api/chat` stream fails
  - Session fetch now merges server data with locally-created sessions to prevent race conditions

## 0.1.7

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.23.0
  - @harness-engineering/types@0.10.0

## 0.1.6

### Patch Changes

- ad48d91: Fix orchestrator state reconciliation, stale worktree reuse, and dashboard production proxy

  **@harness-engineering/orchestrator:**
  - Reconcile completed/claimed state against roadmap on each tick: completed entries are released after a grace period when they reappear as active candidates, and orphaned claims are released when escalated issues leave active candidates
  - Always recreate worktrees from latest base ref on dispatch instead of reusing stale worktrees from before an orchestrator restart
  - Add `analyses/`, `interactions/`, `workspaces/` to `.harness/.gitignore` template so orchestrator runtime directories are never committed

  **@harness-engineering/dashboard:**
  - Proxy orchestrator API and WebSocket in production mode (`harness dashboard run`), not just in Vite dev server — fixes dashboard failing to connect to orchestrator in production
  - Fix CORS to allow non-loopback HOST bindings

  **@harness-engineering/cli:**
  - Add `--orchestrator-url` flag to `harness dashboard` command for configuring the orchestrator proxy target

## 0.1.5

### Patch Changes

- Updated dependencies [f1bc300]
- Updated dependencies
  - @harness-engineering/core@0.22.0

## 0.1.4

### Patch Changes

- 46999c5: Fix `harness dashboard` returning 404 on all routes by serving built client static files from the Hono API server with SPA fallback.
- Updated dependencies [802a1dd]
  - @harness-engineering/core@0.21.4

## 0.1.2

### Patch Changes

- Add ESM `__dirname` polyfill, reduce cyclomatic complexity in page components, and fix Tier 2 structural violations
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.21.2
  - @harness-engineering/graph@0.4.2

## 0.1.1

### Patch Changes

- Fix SSE connection reliability and server context type guards
- Consolidate server index exports

## 0.1.0

### Minor Changes

- Initial dashboard scaffolding with SSE-based real-time updates
