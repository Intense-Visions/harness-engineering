# @harness-engineering/orchestrator

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
