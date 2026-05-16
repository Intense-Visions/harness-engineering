# @harness-engineering/orchestrator

## 0.4.3

### Patch Changes

- Updated dependencies [7ae0561]
  - @harness-engineering/core@0.26.1

## 0.4.2

### Patch Changes

- Updated dependencies [bed30c4]
- Updated dependencies [56176cd]
  - @harness-engineering/core@0.26.0

## 0.4.1

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
  - @harness-engineering/intelligence@0.2.2

## 0.4.0

### Minor Changes

- 287ca16: feat(roadmap): tracker-only roadmap mode (file-less)

  Adds opt-in file-less roadmap mode where the configured external tracker is canonical, eliminating `docs/roadmap.md` as a multi-session conflict surface. See [`docs/changes/roadmap-tracker-only/proposal.md`](https://github.com/Intense-Visions/harness-engineering/blob/main/docs/changes/roadmap-tracker-only/proposal.md) and ADRs 0008–0010.

  **`@harness-engineering/core`:**
  - New `packages/core/src/roadmap/tracker/` submodule: `IssueTrackerClient` interface lifted from orchestrator, `createTrackerClient(config)` factory, body-metadata block parser/serializer, ETag store with LRU eviction, conflict-detection policy, and `GitHubIssuesTrackerAdapter` for file-less mode.
  - New `packages/core/src/roadmap/mode.ts` with `getRoadmapMode(config)` helper.
  - New `packages/core/src/roadmap/load-tracker-client-config.ts` (canonical home for tracker-config loading; replaces three duplicates in cli/dashboard/orchestrator).
  - New `packages/core/src/roadmap/migrate/` namespace: body-diff, history-event hashing, plan-builder, idempotent runner.
  - New `packages/core/src/validation/roadmap-mode.ts` with `validateRoadmapMode` enforcing `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.
  - New `scoreRoadmapCandidatesFileLess` in `packages/core/src/roadmap/pilot-scoring.ts` (priority + createdAt sort, deliberate D4 semantic break).
  - Config schema: `roadmap.mode: "file-backed" | "file-less"` (optional, defaults to `"file-backed"`).
  - Fixes pre-existing `TS2322` in `packages/core/src/roadmap/tracker/adapters/github-issues.ts` (`updateInternal` return shape) and `TS2379` in `packages/cli/src/commands/validate.ts` (call site against `RoadmapModeValidationConfig` widened to accept `undefined`).

  **`@harness-engineering/orchestrator`:**
  - New tracker kind `tracker.kind: "github-issues"` in workflow config selects `GitHubIssuesTrackerAdapter` (see ADR 0010 for the kind-schema decoupling rationale vs `roadmap.tracker.kind: "github"`).
  - `createTracker()` dispatches on `tracker.kind`; the Phase 4 stub at orchestrator constructor is removed.
  - Roadmap-status (S5) and roadmap-append (S6) endpoints translate `ConflictError` to HTTP `409 TRACKER_CONFLICT` shape; React surface lands in a follow-up.

  **`@harness-engineering/cli`:**
  - New `harness roadmap` command group with `harness roadmap migrate --to=file-less [--dry-run]` subcommand. One-shot, dry-run-capable, idempotent migration that creates GitHub issues for unmigrated features, writes body metadata blocks, posts deduplicated history comments, archives `docs/roadmap.md`, and flips `roadmap.mode`.
  - `manage_roadmap` MCP tool is mode-aware: in file-less mode, dispatches through `IssueTrackerClient` instead of touching `docs/roadmap.md`.
  - `harness validate` runs the two new cross-cutting rules `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.

  **Documentation:**
  - Three ADRs added under `docs/knowledge/decisions/`: 0008 (tracker abstraction in core), 0009 (audit history as issue comments), 0010 (`tracker.kind` schema decoupling).
  - New knowledge domain `docs/knowledge/roadmap/` with three entries: `file-less-roadmap-mode` (business_concept), `tracker-as-source-of-truth` (business_rule), `roadmap-migration-to-file-less` (business_process).
  - `docs/guides/roadmap-sync.md` gains a `## File-less mode` section.
  - `docs/reference/configuration.md`, `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, and `AGENTS.md` updated.
  - Migration walkthrough at `docs/changes/roadmap-tracker-only/migration.md` (shipped in Phase 5).
  - Proposal §F2 wording reworded to "best-effort detection" per Phase 2 D-P2-B.

### Patch Changes

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

- Updated dependencies [287ca16]
  - @harness-engineering/core@0.24.0

## 0.3.2

### Patch Changes

- Updated dependencies [ba8da2e]
- Updated dependencies [54d9494]
- Updated dependencies [a1df67e]
  - @harness-engineering/core@0.23.8

## 0.3.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0
  - @harness-engineering/core@0.23.7
  - @harness-engineering/intelligence@0.2.1

## 0.3.0

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
  - @harness-engineering/intelligence@0.2.0
  - @harness-engineering/core@0.23.6

## 0.2.17

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1
  - @harness-engineering/core@0.23.5
  - @harness-engineering/intelligence@0.1.5

## 0.2.16

### Patch Changes

- Updated dependencies [3bfe4e4]
  - @harness-engineering/graph@0.7.0
  - @harness-engineering/core@0.23.4
  - @harness-engineering/intelligence@0.1.4

## 0.2.15

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.6.0
  - @harness-engineering/core@0.23.3
  - @harness-engineering/intelligence@0.1.3

## 0.2.14

### Patch Changes

- e3dc2e7: Add runtime validation for JSON.parse calls flagged by security scan
  - orchestrator: validate persisted maintenance history with Zod schema instead of bare Array.isArray check
  - dashboard: add structural type guards (object + discriminator check) before casting parsed WebSocket/SSE messages

## 0.2.13

### Patch Changes

- f62d6ab: Add `no-process-env-in-spawn` ESLint rule and fix env leak in chat-proxy
  - New rule detects `process.env` passed directly to child process spawn calls, preventing environment variable leaks
  - Fix env leak in orchestrator chat-proxy identified by the new rule

- f62d6ab: SSE streaming and chat-proxy fixes
  - Emit SSE events from CLI assistant message content blocks
  - Update chat-proxy tests to use streaming event format
  - Suppress unused mapContentBlock warning
  - Harden workspace cleanup guard against false escalations

- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/intelligence@0.1.2
  - @harness-engineering/core@0.23.2
  - @harness-engineering/types@0.10.1

## 0.2.12

### Patch Changes

- refactor: decompose `orchestrator.ts` (1,882 → 1,313 lines) by extracting intelligence pipeline runner and completion handler into dedicated modules (`intelligence/pipeline-runner.ts`, `completion/handler.ts`)
- refactor: replace barrel imports from `./core/index` with direct imports from source modules (`state-machine`, `state-helpers`, `model-router`, `analysis-archive`, `analysis-comment`, `published-index`) to make dependency chains explicit
- refactor: introduce `OrchestratorContext` interface for shared dependency injection into extracted sub-services

## 0.2.11

### Patch Changes

- fix(ci): cross-platform CI fixes for Windows test timeouts and coverage scripts
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.23.0
  - @harness-engineering/types@0.10.0
  - @harness-engineering/intelligence@0.1.1

## 0.2.10

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

## 0.2.9

### Patch Changes

- 1d0fdd8: Rename orchestrator config file from WORKFLOW.md to harness.orchestrator.md. The workflow loader error messages and default template reflect the new name.

## 0.2.8

### Patch Changes

- Harden orchestrator, rate limiter, and container security defaults.

  **@harness-engineering/orchestrator:**
  - Extract PR detection from `Orchestrator` into standalone `PRDetector` module
  - Fix rate-limiter stack overflow risk by replacing `Math.min(...spread)` with `reduce`
  - Ensure rate limit delays are always >= 1ms
  - Default container network to `none` and block privileged Docker flags
  - Fix stale claim detection: missing timestamp now treated as stale
  - Fix scheduler to only record `lastRunMinute` on task success
  - Add error handling for `ensureBranch`/`ensurePR`/agent dispatch in task-runner
  - Add resilient `rebase --abort` recovery in pr-manager

  **@harness-engineering/core:**
  - Fix `contextBudget` edge cases (zero total tokens, zero `originalSum` during redistribution)
  - Parse `npm audit` stdout on non-zero exit in `SecurityTimelineManager`
  - Add security rule tests (crypto, deserialization, express, go, network, node, path-traversal, react, xss)

  **@harness-engineering/cli:**
  - Break `StepResult` type cycle between `setup.ts` and `telemetry-wizard.ts` via `setup-types.ts`

- Updated dependencies [f1bc300]
- Updated dependencies
  - @harness-engineering/core@0.22.0

## 0.2.7

### Patch Changes

- Updated dependencies [802a1dd]
  - @harness-engineering/core@0.21.4

## 0.2.6

### Patch Changes

- Reduce Tier 2 structural violations and fix exactOptionalPropertyTypes errors
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.21.2
  - @harness-engineering/types@0.9.1

## 0.2.5

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.7.0
  - @harness-engineering/core@0.17.0

## 0.2.4

### Patch Changes

- Multi-platform MCP expansion, security hardening, and release readiness fixes

  **@harness-engineering/cli (minor):**
  - Multi-platform MCP support: add Codex CLI and Cursor to `harness setup-mcp`, `harness setup`, and slash command generation
  - Cursor tool picker with `--pick` and `--yes` flags using `@clack/prompts` for interactive tool selection
  - TOML MCP entry writer for Codex `.codex/config.toml` integration
  - Sentinel prompt injection defense hooks (`sentinel-pre`, `sentinel-post`) added to hook profiles
  - `--tools` variadic option for `harness mcp` command
  - Fix lint errors in hooks (no-misleading-character-class, unused imports, `any` types)
  - Fix cost-tracker hook field naming (snake_case → camelCase alignment)
  - Fix test gaps: doctor MCP mock, usage fetch mock, profiles/integration hook counts

  **@harness-engineering/core (minor):**
  - Usage module: Claude Code JSONL parser (`parseCCRecords`), daily and session aggregation
  - Security scanner: session-scoped taint state management, `SEC-DEF-*` insecure-defaults rules, `SEC-EDGE-*` sharp-edges rules
  - Security: false-positive verification gate replacing suppression checks, `parseHarnessIgnore` helper
  - Fix lint: eslint-disable for intentional zero-width character regex in injection patterns

  **@harness-engineering/types (minor):**
  - Add `DailyUsage`, `SessionUsage`, `UsageRecord`, and `ModelPricing` types for cost tracking
  - Export aggregate types from types barrel

  **@harness-engineering/orchestrator (patch):**
  - Integrate sentinel config scanning into dispatch pipeline
  - Fix conditional spread for optional line property

- Updated dependencies
  - @harness-engineering/core@0.16.0
  - @harness-engineering/types@0.6.0

## 0.2.3

### Patch Changes

- **README added** — Architecture diagram, quick start guide, core concepts (event-sourced state machine, candidate selection, agent backends, workspace management), and full API reference.
- **Cross-platform path fix** — `GraphConstraintAdapter` path normalization for consistent separators.
- Updated dependencies
  - @harness-engineering/core@0.13.1

## 0.2.2

### Patch Changes

- Fix circular dependency between orchestrator and http server modules
- Updated dependencies
  - @harness-engineering/core@0.13.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.12.0

## 0.2.0

### Minor Changes

- # Orchestrator Release & Workspace Hardening

  ## New Features
  - **Orchestrator Daemon**: Implemented a long-lived daemon for autonomous agent lifecycle management.
    - Pure state machine core for deterministic dispatch and reconciliation.
    - Multi-tracker support (Roadmap adapter implemented).
    - Isolated per-issue workspaces with deterministic path resolution.
    - Ink-based TUI and HTTP API for real-time observability.
  - **Harness Docs Pipeline**: Sequential pipeline for documentation health (drift detection, coverage audit, and auto-alignment).

  ## Improvements
  - **Documentation Coverage**: Increased project-wide documentation coverage to **84%**.
    - Comprehensive JSDoc/TSDoc for core APIs.
    - New Orchestrator Guide and API Reference.
    - Unified Source Map reference for all packages.
  - **Workspace Stability**: Resolved all pending lint errors and type mismatches in core packages.
  - **Graceful Shutdown**: Added signal handling and centralized resource cleanup for the orchestrator daemon.
  - **Hardened Security**: Restricted orchestrator HTTP API to localhost.

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.11.0
  - @harness-engineering/types@0.3.0
