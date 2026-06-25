# @harness-engineering/dashboard

## 0.10.0

### Minor Changes

- a4a1d8a: Add a **Work in Flight** kanban board (`/s/kanban`) that surfaces live orchestrator/parallel-coordinator state as kanban lanes — Queued, In Progress, Blocked, and Done. Each in-flight task renders as a card showing its owning agent (backend), worktree path, run-attempt phase, elapsed time, blocker reason, and `blockedBy` dependency chips (cross-highlighted when the blocker is also on the board).

  The board is **read-only and reuses the existing `useOrchestratorSocket` WebSocket snapshot stream — there are zero orchestrator/server changes.** Lane assignment is a pure, unit-tested `deriveLanes(snapshot)` function (`src/client/utils/kanban-lanes.ts`): `running` agents route to In Progress, or to Blocked when their phase is `RateLimitSleeping`/`Stalled`/`Failed`/`TimedOut`; `retryAttempts` carry their error into Blocked; `claimed`-but-not-running ids sit in Queued; and `completed` ids appear as compact Done chips. The client `RunningAgent`/`OrchestratorSnapshot` types were widened with `workspacePath`, `attempt`, `issue.identifier`, `issue.blockedBy`, and `completed` to match the payload `Orchestrator.getSnapshot()` already serializes. Phase coloring and elapsed-time formatting are extracted into a shared `phase-presentation.ts` helper. Complements the retrospective health surfaces and the existing Orchestrator feed view. Adoption #2 (SPECKITTY-2) from the Spec Kitty comparison analysis.

### Patch Changes

- Updated dependencies [8e8e7c1]
  - @harness-engineering/orchestrator@0.8.3
  - @harness-engineering/types@0.16.1
  - @harness-engineering/core@0.30.1
  - @harness-engineering/graph@0.11.1

## 0.9.0

### Minor Changes

- 43f7333: Add a curated five-signal dashboard panel as the default landing view. A new `/s/signals` page (with `/` redirecting to it) renders five signals — `pr-merged-without-multi-persona-review`, `coverage-trend-down-30d`, `complexity-trend-up-30d`, `baseline-auto-update-count`, and `eval-fail-rate` — each with current value, 30-day trend, threshold status, and a sparkline. Backed by a `SignalProvider` registry, a shared `SignalTimelineStore` (hybrid derive-now + cache to `.harness/signals/timeline.json`), and a `GET /api/signals` route that isolates per-signal failures via `Promise.allSettled`. `eval-fail-rate` consumes `harness:outcome-eval` verdicts through the knowledge graph's `execution_outcome` nodes with zero code coupling (documented in ADR 0037). Implements roadmap #534; signals documented in `docs/standard/signals.md`.

### Patch Changes

- 0ca37f4: Upgrade `@hono/node-server` from `^1.19.13` to `^2.0.4`. v2 is a perf-only major (up to 2.3× throughput on body-parsing) with the same public API. The pnpm.overrides floor for `@hono/node-server` is also bumped to `>=2.0.4`. v2 drops Node 18 support (we already require Node ≥22) and removes the Vercel adapter (not used).
- Updated dependencies [8128981]
- Updated dependencies [d11e2e6]
- Updated dependencies [07c399b]
- Updated dependencies [4b2f910]
- Updated dependencies [a6f7cd3]
- Updated dependencies [ca706f5]
  - @harness-engineering/core@0.30.0
  - @harness-engineering/orchestrator@0.8.2

## 0.8.2

### Patch Changes

- Updated dependencies [1cc843b]
- Updated dependencies [c17ad8b]
- Updated dependencies [99b5cbf]
- Updated dependencies [7c66168]
- Updated dependencies [5f9ed8c]
- Updated dependencies [ee2f6a0]
- Updated dependencies [7353b60]
- Updated dependencies [318b878]
- Updated dependencies [af56053]
- Updated dependencies [aaefe1b]
  - @harness-engineering/orchestrator@0.8.1
  - @harness-engineering/core@0.29.0
  - @harness-engineering/graph@0.11.0
  - @harness-engineering/types@0.16.0

## 0.8.1

### Patch Changes

- Updated dependencies [39bfd73]
- Updated dependencies [1fd39a6]
  - @harness-engineering/core@0.28.2
  - @harness-engineering/orchestrator@0.8.0

## 0.8.0

### Minor Changes

- dcca2ce: Spec B (Granular Task→Backend Routing): per-skill + per-cognitive-mode routing axes with fallback chains, BackendRouter chain-walk emitting RoutingDecision records, config validator (hard error + warn semantics), dispatch-site wiring with `HARNESS_BACKEND_OVERRIDE` env hint, RoutingDecisionBus with bounded ring buffer, 3 HTTP routes + WS topic `routing:decision`, `harness routing {config,trace,decisions}` CLI + `harness skill run --backend`, dashboard `/routing` panel (4 cards + WS + polling fallback), 5 ADRs (0029-0033). RoutingValue schema widening is additive/non-breaking (scalar form preserves byte-identical pre-Spec-B behavior).

### Patch Changes

- bbc164f: Make harness skills and personas discoverable in Codex CLI, and fix a long-standing scanner false-positive flood.

  **@harness-engineering/cli** (minor): the Codex slash-command adapter now writes to `~/.codex/skills/<name>/SKILL.md` with the YAML frontmatter Codex's skill discovery requires; all 50 harness skills are reachable via `$harness-debugging`, `/skills`, and auto-trigger. The agent-definitions adapter emits real Codex subagent TOMLs at `~/.codex/agents/<name>.toml` (12 personas) so they appear in `/agent`. Both surfaces previously wrote dead files Codex ignored.

  **@harness-engineering/core** (patch): `SecurityScanner` now honors `// harness-ignore SEC-XXX: justification` on the line above the flagged code, matching the convention already in use across the repo. Previously only same-line annotations were recognized, so every prior-line annotation silently re-fired the suppressed rule.

  **@harness-engineering/orchestrator** / **@harness-engineering/dashboard** (patch): annotate the previously-flagged `JSON.parse` and `writeFile` sites with the explanatory `// harness-ignore` comments the scanner now reads correctly. No runtime behavior change.

  Also includes an infra fix to `.husky/pre-push` so nvm's Node takes precedence over Homebrew's on PATH (otherwise `better-sqlite3` fails to load under a newer Homebrew Node and blocks every push).

- 16048ad: Bump protobufjs to ^7.6.1, fast-xml-parser to >=5.7.0, ip-address to >=10.1.1 (and other transitive CVE fixes) via `pnpm.overrides` in root package.json.

  Clears 4 high CVEs (all protobufjs code-injection/prototype-pollution/DoS — vulnerable <=7.5.5) and several moderate CVEs that the existing `pnpm-workspace.yaml` `overrides:` block was failing to enforce — pnpm 8.x reads `pnpm.overrides` in `package.json` but ignores the same key in workspace.yaml.

  Direct dependency bumps surfaced by the pin: `vite ^6.3.0 -> ^6.4.2` in dashboard, `ws ^8.20.0 -> ^8.21.0` in orchestrator. Both are patch-level upstream fixes (path traversal, uninitialized memory disclosure).

  Updates `auditExceptions` to remove the 8 protobufjs entries that were documented as "blocked by @google/genai → protobufjs ^7.5.4 pin" — the actual constraint is `^7.5.4` (i.e., `>=7.5.4 <8.0.0`), which permits 7.6.1. The rationale was stale. Orchestrator and intelligence test suites pass under protobufjs 7.6.1; @google/genai@1.50.1 has no observable break.

  Audit summary: 19 advisories (4 high, 14 moderate, 1 low) -> 7 advisories (0 high, 6 moderate, 1 low). Remaining moderates are all transitive via vitepress (vite ^5 pin), turbo 2.9.6, or deep transitives (brace-expansion, uuid, qs) — separate effort if pursued.

- Updated dependencies [d1c9bda]
- Updated dependencies [bbc164f]
- Updated dependencies [573c23b]
- Updated dependencies [16048ad]
- Updated dependencies [0eac8eb]
- Updated dependencies [dcca2ce]
  - @harness-engineering/graph@0.10.0
  - @harness-engineering/core@0.28.1
  - @harness-engineering/orchestrator@0.7.0
  - @harness-engineering/types@0.15.0

## 0.7.1

### Patch Changes

- Updated dependencies [bce809f]
  - @harness-engineering/orchestrator@0.6.1

## 0.7.0

### Minor Changes

- c3653ff: Hermes Phase 4: Skill proposal / refinement loop with provenance + soundness gate

  Agent-emitted skill proposals routed through a review queue gated by a
  mechanical soundness check before promotion to the catalog. Closes the
  K1 killer-adoption row from the Hermes adoption meta-spec.

  **New surfaces:**
  - MCP tool `emit_skill_proposal` (tier `standard`) — writes
    `.harness/proposals/<id>.json` and emits `proposal.created`. Emit is
    non-blocking; the soundness gate fires on approve, not on emit.
  - CLI `harness proposals list|show|approve|reject` for queue management
    plus one-shot `harness backfill-skill-provenance` migration that
    stamps `provenance: user-authored` on every pre-Phase-4 catalog skill.
  - Dashboard `/s/proposals` page with inline content, gate findings,
    approve / reject / edit / run-gate actions; reviewer-UX budget < 30s
    per proposal.
  - Seven gateway routes under `/api/v1/proposals/*` (list / get /
    run-gate / approve / reject / edit) — reads use `read-status`,
    mutations require the new `manage-proposals` scope (8th entry in
    `SCOPE_VOCABULARY` and `TokenScopeSchema`).
  - Three lifecycle events (`proposal.created` / `approved` / `rejected`)
    fan out via the Phase 0 webhook bus and Phase 3 notification sinks
    with envelope derivers.
  - Maintenance task `proposal-provenance-backfill` (housekeeping #4,
    Feb 31 cron so the loop never fires automatically).

  **Strict invariants:** `kind` ↔ content shape (new-skill ⇒
  skillYaml+skillMd; refinement ⇒ targetSkill+diff); gate freshness
  < 24h before promotion; refinement edits must diverge from git HEAD
  before approval stamps provenance; provenance enum is closed
  (`community | agent-proposed | user-authored`, expansion requires ADR
  amendment).

  **Skills-mode soundness review degradation:** v1 ships mechanical
  structural checks (kebab-case name, parseable skill.yaml, SKILL.md
  bounds, unified-diff well-formedness). The full
  `harness:soundness-review --mode skill` vocabulary is a follow-up spec;
  both implementations share the same finding shape so the swap is
  purely additive.

  **Test coverage:** 75 new tests across five packages (types schema 15,
  core store + usage 9, MCP tool 8, CLI subcommand 6 + backfill 6,
  orchestrator gate 6 + promote 7 + events 4 + routes 10, envelope
  derivers 4 new rows). Existing scopes test passes with the new
  vocabulary entry.

  ADRs: 0016 (workflow), 0017 (token scope). Knowledge nodes:
  `skill-proposals.md`, `skill-provenance.md`. Spec + plan at
  `docs/changes/hermes-phase-4-skill-proposals/`.

  **Incidental fix:** Replaces a fixed 150ms wait in
  `packages/orchestrator/src/server/webhooks-integration.test.ts` with a
  poll loop. The fixed wait flaked under coverage instrumentation and
  blocked the Phase 4 pre-push hook.

### Patch Changes

- Updated dependencies [c94bac8]
- Updated dependencies [4aa241f]
- Updated dependencies [c3653ff]
  - @harness-engineering/orchestrator@0.6.0
  - @harness-engineering/types@0.14.0
  - @harness-engineering/core@0.28.0

## 0.6.7

### Patch Changes

- Updated dependencies [3d6e340]
- Updated dependencies [2481e59]
- Updated dependencies [2602530]
  - @harness-engineering/types@0.13.0
  - @harness-engineering/core@0.27.0
  - @harness-engineering/orchestrator@0.5.0

## 0.6.6

### Patch Changes

- Updated dependencies [2724dfe]
  - @harness-engineering/core@0.26.4
  - @harness-engineering/orchestrator@0.4.6

## 0.6.5

### Patch Changes

- Updated dependencies [1796528]
  - @harness-engineering/core@0.26.3
  - @harness-engineering/orchestrator@0.4.5

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
