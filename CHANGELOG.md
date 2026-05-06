# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

## [Unreleased]

### Added

- **Local model fallback for the orchestrator** — `agent.localModel` accepts an array of model names; `LocalModelResolver` probes the configured local backend on a fixed interval and resolves the first available model from the list. `getModel` callback threaded through `LocalBackend` and `PiBackend` so backends read the resolved model per-session instead of from raw config. Resolver status broadcast via `local-model:status` WebSocket and exposed at `GET /api/v1/local-model/status`. Dashboard surfaces an unhealthy-resolver banner on the Orchestrator page via the `useLocalModelStatus` hook. (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/dashboard`)
- **Multi-backend routing for the orchestrator** — `agent.backends` (named map of backend definitions) and `agent.routing` (per-use-case selection of backend names). Routable use cases: `default`, four scope tiers (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), and two intelligence layers (`intelligence.sel`, `intelligence.pesl`). Promotes `local` / `pi` to first-class named backends; multi-local configs supported with one `LocalModelResolver` per backend. New `GET /api/v1/local-models/status` endpoint returns `NamedLocalModelStatus[]`; dashboard renders one banner per unhealthy local backend. Single-runner dispatch via per-issue `OrchestratorBackendFactory` replaces the dual-runner split. Distinct intelligence-pipeline providers per layer (`peslProvider` constructor option). See [`docs/guides/multi-backend-routing.md`](docs/guides/multi-backend-routing.md), [ADR 0005](docs/knowledge/decisions/0005-named-backends-map.md), [ADR 0006](docs/knowledge/decisions/0006-single-runner-orchestrator-dispatch.md), [ADR 0007](docs/knowledge/decisions/0007-multi-provider-intelligence-pipeline.md). (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/intelligence`, `@harness-engineering/dashboard`)
- **Knowledge document materialization** — `KnowledgeDocMaterializer` generates markdown knowledge docs from graph gap analysis, wired into the pipeline convergence loop with differential gap tracking. CLI displays materialization results and differential gaps in `knowledge-pipeline` output. Dashboard registers knowledge pipeline in skill constants. (`@harness-engineering/graph@0.6.0`, `@harness-engineering/cli@1.27.0`, `@harness-engineering/dashboard@0.2.2`)
- **Adoption telemetry** — `harness adoption` command group (skills, recent, skill) for viewing skill usage metrics. `adoption-tracker` stop hook records invocations to `.harness/metrics/adoption.jsonl`. New `adoption` config key to disable tracking. (`@harness-engineering/cli`, `@harness-engineering/core`, `@harness-engineering/types`)
- **Central telemetry** — `harness telemetry` command group (identify, status) for managing anonymous usage analytics. `telemetry-reporter` stop hook sends events to PostHog. Consent via `DO_NOT_TRACK=1`, `HARNESS_TELEMETRY_OPTOUT=1`, or `telemetry.enabled: false`. (`@harness-engineering/cli`, `@harness-engineering/core`, `@harness-engineering/types`)
- **Session cleanup** — `harness cleanup-sessions` command removes stale `.harness/sessions/` directories older than 24 hours with `--dry-run` support. (`@harness-engineering/cli`)
- **Agent config validation** — `harness validate --agent-configs` with agnix binary integration and built-in TypeScript fallback rules (`HARNESS-AC-*`). Supports `--strict`, `--agnix-bin`, `--json`. (`@harness-engineering/cli@1.25.0`, `@harness-engineering/core@0.22.0`)
- **Security rule tests** — Unit tests for 9 security rule categories: crypto, deserialization, express, go, network, node, path-traversal, react, xss. (`@harness-engineering/core@0.22.0`)

### Fixed

- **Init scaffolds into existing projects** — `harness init` no longer creates project scaffold files (pom.xml, App.java, etc.) when the target directory already contains a project. Detects pre-existing projects by checking for common build/config files (build.gradle, package.json, go.mod, etc.) and only writes harness config files (harness.config.json, AGENTS.md). Also adds build.gradle/build.gradle.kts to the package config skip set. (`@harness-engineering/cli`) ([#235](https://github.com/Intense-Visions/harness-engineering/issues/235))
- **Hook refresh fails after install** — `resolveHookSourceDir()` used a relative path (`../../hooks`) that only worked in the dev source layout; after tsup bundling, `__dirname` points to `dist/` and the path resolved outside the package. Additionally, `copy-assets.mjs` never copied `src/hooks/*.js` scripts into `dist/`. Fixed by adding a bundled-layout candidate path and copying hook scripts during build. (`@harness-engineering/cli@1.25.1`)
- **Rate-limiter stack overflow** — Replace `Math.min(...spread)` with `reduce` to prevent stack overflow on large timestamp arrays. Ensure delays are always >= 1ms. (`@harness-engineering/orchestrator@0.2.8`)
- **Container security defaults** — Default container network to `none` instead of `host`; block `--privileged`, `--cap-add`, `--security-opt`, `--pid`, `--ipc`, `--userns` flags. (`@harness-engineering/orchestrator@0.2.8`)
- **Stale claim detection** — Missing `updatedAt` timestamp now treated as stale (was incorrectly treated as fresh). (`@harness-engineering/orchestrator@0.2.8`)
- **Scheduler lastRunMinute** — Only record `lastRunMinute` on task success, preventing failed tasks from being skipped on next interval. (`@harness-engineering/orchestrator@0.2.8`)
- **Task-runner error handling** — Add try-catch for `ensureBranch`, `ensurePR`, and agent dispatch to prevent unhandled rejections from losing agent work. (`@harness-engineering/orchestrator@0.2.8`)
- **PR-manager rebase recovery** — Resilient `rebase --abort` with `reset --hard` fallback when no rebase is in progress. (`@harness-engineering/orchestrator@0.2.8`)
- **contextBudget edge cases** — Handle zero total tokens and zero `originalSum` during ratio redistribution. (`@harness-engineering/core@0.22.0`)
- **npm audit parsing** — Parse `npm audit` stdout on non-zero exit (audit exits non-zero when vulnerabilities exist). (`@harness-engineering/core@0.22.0`)
- **StepResult type cycle** — Break circular import between `setup.ts` and `telemetry-wizard.ts` via `setup-types.ts`. (`@harness-engineering/cli@1.25.0`)
- **Dashboard localStorage crash** — Guard `localStorage.getItem()` in `useChatPanel` module init to prevent crash in test environments where `window` exists but `localStorage` is not a function. (`@harness-engineering/dashboard`)

### Changed

- **Legacy orchestrator agent config deprecated** — `agent.backend` and `agent.localBackend` continue to work via an in-memory migration shim that synthesizes `agent.backends.primary` and `agent.backends.local` plus a `routing` map mirroring `escalation.autoExecute`. Orchestrator emits a one-time `warn`-level log at startup naming each deprecated field present. Hard removal lands in a follow-up release per the deprecation timeline. (`@harness-engineering/orchestrator`)
- **Orchestrator decomposition** — Extract intelligence pipeline runner (461 lines) and completion handler (218 lines) from the 1,882-line `orchestrator.ts` into dedicated modules, reducing it to 1,313 lines. Replace hidden barrel imports with direct module imports for explicit dependency chains. (`@harness-engineering/orchestrator`)
- **Core barrel auto-generation** — Add `scripts/generate-core-barrel.mjs` to auto-generate `packages/core/src/index.ts` from directory structure, with `--check` mode for CI. Wired into `pnpm run generate:barrels`. (`@harness-engineering/core`)
- **PRDetector extraction** — PR detection logic extracted from `Orchestrator` into standalone `PRDetector` module with throttled concurrency. (`@harness-engineering/orchestrator@0.2.8`)

## 0.14.1 — 2026-04-07

### Fixed

- **Blocked status corruption in external sync** — `syncFromExternal` silently flipped manually-set `blocked` features to `planned` because GitHub Issues "open" mapped to "planned" and `STATUS_RANK` treated both as lateral (rank 1). Added guard to skip `blocked → planned` transitions unless `forceSync` is set. (`@harness-engineering/core@0.21.1`)

### Changed

- **Complexity reduction** — Refactored `prediction-engine`, `aggregator`, `traceability` command, `Traceability` query, and `GraphStore` to reduce cyclomatic complexity. (`@harness-engineering/core@0.21.1`, `@harness-engineering/cli@1.23.2`, `@harness-engineering/graph@0.4.1`)
- **Dead code removal** — Removed orphaned `impact-lab-generator` module, moved misplaced test file. (`@harness-engineering/core@0.21.1`)
- **Dashboard SSE fixes** — Improved server-sent events reliability and server context handling. (`@harness-engineering/dashboard@0.1.1`)

## 0.14.0 — 2026-04-05

### Fixed

- **Roadmap pilot sync gap** — The roadmap pilot skill assigned features by calling `assignFeature()` directly and writing `roadmap.md` manually, bypassing the `manage_roadmap` MCP tool where `triggerExternalSync` is wired. GitHub Issues were never updated on assignment. (`@harness-engineering/cli@1.23.0`)

### Added

- **`assignee` field on `manage_roadmap update`** — The `update` action now accepts an `assignee` parameter, delegating to `assignFeature()` for proper assignment history tracking. External sync fires automatically via the existing mutation hook. (`@harness-engineering/cli@1.23.0`)

### Changed

- **Skill fallback sync warnings** — All 8 MCP-fallback paths across 5 skills (brainstorming, execution, autopilot, roadmap, roadmap-pilot) now warn when external sync is skipped due to MCP unavailability and advise running `manage_roadmap sync` when MCP is restored.

## 0.13.0 — 2026-04-04

### Added

- **Predictive Architecture Failure** — Weighted linear regression extrapolates decay trends per metric category with recency bias. `PredictionEngine` produces per-category forecasts at configurable horizons with tiered confidence (high/medium/low). `SpecImpactEstimator` extracts structural signals from specs to produce roadmap-aware adjusted forecasts. New `harness predict` CLI command and `predict_failures` MCP tool. (`@harness-engineering/core@0.20.0`, `@harness-engineering/cli@1.22.0`)
- **Spec-to-Implementation Traceability** — Requirement nodes, `requires`/`verified_by`/`tested_by` edges, `RequirementIngestor`, coverage matrix CLI (`harness traceability`) and MCP tool (`check_traceability`). Hybrid test linking with confidence signals. (`@harness-engineering/graph@0.4.0`, `@harness-engineering/cli@1.22.0`)
- **Architecture Decay Timeline** — `TimelineManager` captures time-series architectural health snapshots. Composite 0–100 stability score across 7 metric categories. `harness snapshot capture|trends|list` CLI commands and `get_decay_trends` MCP tool. Weekly CI workflow. (`@harness-engineering/core@0.20.0`, `@harness-engineering/cli@1.22.0`)
- **Skill Recommendation Engine** — Three-layer recommendation: hard-rule matching, weighted health scoring, topological sequencing. `captureHealthSnapshot` orchestrator with graph metrics. `harness recommend` CLI command and `recommend_skills` MCP tool. Health-aware `search_skills` passive boost. (`@harness-engineering/core@0.20.0`, `@harness-engineering/cli@1.22.0`)
- **CI traceability check** — New `traceability` check added to CI orchestrator (9 checks total). (`@harness-engineering/core@0.20.0`)

### Fixed

- **Typecheck errors** in predict CLI and MCP tool (`exactOptionalPropertyTypes` compliance).
- **Doc drift** — Updated version numbers in API docs (cli, core, types), corrected MCP tool count (52), skills count (81), and graph node/edge type counts (30/25) across README, getting-started, and features-overview guides.

## 0.12.1 — 2026-04-04

### Fixed

- **Injection scanner false positives** — The sentinel injection guard no longer scans output from trusted harness MCP tools (`run_skill`, `gather_context`, etc.), preventing false INJ-CTX-003 and INJ-PERM-003 taints on legitimate skill documentation. Input scanning is preserved for all tools. (`@harness-engineering/cli@1.20.1`)

## 0.12.0 — 2026-04-04

### Added

- **Assignee push on sync** — `createTicket` and `updateTicket` now include the `assignees` field in GitHub API payloads, keeping roadmap assignees in sync with GitHub Issue assignees bidirectionally.
- **Auto-populate assignee** — `syncToExternal` fetches the authenticated user's GitHub login via `GET /user` and auto-assigns features with no assignee. Cached per adapter instance.
- **`getAuthenticatedUser()`** — New method on `TrackerSyncAdapter` interface and `GitHubIssuesSyncAdapter` implementation. Returns `@login` format.

### Fixed

- **Project `.env` loading for MCP sync** — `triggerExternalSync` now loads `.env` from the project root when `GITHUB_TOKEN` is not in the environment, fixing token discovery when the MCP server's working directory differs from the project.

## 0.11.0 — 2026-04-03

### Added

- **External tracker sync** — Bidirectional sync between `roadmap.md` and GitHub Issues via `TrackerSyncAdapter` interface. Split authority model: roadmap owns planning fields, external service owns execution/assignment. Sync fires automatically on all 6 state transitions.
- **GitHub Issues adapter** — Full `GitHubIssuesSyncAdapter` implementation with label-based status disambiguation, pagination, and error collection. Configurable via `roadmap.tracker` in `harness.config.json`.
- **Sync engine** — `syncToExternal` (push), `syncFromExternal` (pull with directional guard), `fullSync` (mutex-serialized read-push-pull-write cycle). External assignee wins; status regressions blocked unless `forceSync`.
- **Roadmap pilot skill** — AI-assisted next-item selection via `harness-roadmap-pilot`. Two-tier scoring: explicit priority first (P0–P3), then weighted position (0.5) / dependents (0.3) / affinity (0.2). Routes to brainstorming or autopilot based on spec existence.
- **Assignment with affinity** — `Assignee`, `Priority`, and `External-ID` fields on roadmap features. Assignment history section in `roadmap.md` with affinity-based routing. Reassignment produces two-record audit trail.
- **New types** — `Priority`, `AssignmentRecord`, `ExternalTicket`, `ExternalTicketState`, `SyncResult`, `TrackerSyncConfig` in `@harness-engineering/types`.
- **Config schema** — `TrackerConfigSchema` and `RoadmapConfigSchema` with Zod validation for tracker configuration.
- **Shared status ranking** — Extracted `STATUS_RANK` and `isRegression` to `status-rank.ts`, shared by local and external sync paths.
- **State transition hooks** — 4 new lifecycle actions (`task-start`, `task-complete`, `phase-start`, `phase-complete`) in `manage_state`, each triggering `autoSyncRoadmap` with optional external sync.

### Fixed

- `parseAssignmentHistory` now bounds to next H2 heading, preventing content bleed
- `resolveReverseStatus` moved from GitHub adapter to adapter-agnostic `tracker-sync.ts`
- `reverseStatusMap` optionality aligned between TypeScript type and Zod schema
- `loadTrackerConfig` validates via `TrackerConfigSchema.safeParse` instead of raw assertion
- Unknown blockers in pilot scoring treated as resolved (external dependencies)
- Feature construction in `roadmap.ts` includes new required fields

## 0.10.0 — 2026-04-01

### Added

- **Multi-platform MCP support** — Codex CLI and Cursor join Claude Code as supported AI agent platforms. `harness setup-mcp` auto-detects and configures each platform. Slash command generation now produces platform-specific output for all three.
- **Cursor tool picker** — Interactive `--pick` flag with `@clack/prompts` for selecting which MCP tools to expose to Cursor. `--yes` flag for non-interactive CI usage with curated defaults.
- **Codex TOML integration** — `writeTomlMcpEntry` utility for writing MCP server config to `.codex/config.toml`.
- **Sentinel prompt injection defense** — `sentinel-pre` and `sentinel-post` hook scripts scan tool inputs/outputs for injection patterns, block destructive operations during tainted sessions. Added to strict hook profile.
- **Usage analytics** — Claude Code JSONL parser (`parseCCRecords`), daily and session aggregation types, `--include-claude-sessions` flag for `harness usage`.
- **Security scanner hardening** — Session-scoped taint state management, `SEC-DEF-*` insecure-defaults rules, `SEC-EDGE-*` sharp-edges rules, false-positive verification gate with `parseHarnessIgnore` helper.
- **Cost tracking types** — `DailyUsage`, `SessionUsage`, `UsageRecord`, and `ModelPricing` types in `@harness-engineering/types`.
- **Orchestrator sentinel integration** — Sentinel config scanning wired into the dispatch pipeline.

### Fixed

- Lint errors in hook scripts (no-misleading-character-class, unused imports, `any` types)
- Cost-tracker hook field naming alignment (snake_case → camelCase)
- Test gaps: doctor MCP mock, usage fetch mock, profiles/integration hook counts, gate test timeout
- Doc drift: version numbers, tool counts, and skill counts synchronized across docs

## 0.9.0 — 2026-03-30

### Added

- **Code navigation module** — AST-powered outline extraction, cross-file symbol search, and bounded unfold with tree-sitter parser cache. 3 new MCP tools: `code_outline`, `code_search`, `code_unfold` (49 total).
- **Hooks system** — 6 hook scripts (`block-no-verify`, `cost-tracker`, `pre-compact-state`, `protect-config`, `quality-gate`, `profiles`) with minimal/standard/strict profile tiers. CLI commands `hooks init`, `hooks list`, `hooks remove` for managing Claude Code hooks.
- **Structured event log** — JSONL append-only event timeline with content-hash deduplication, integrated into `gather_context`.
- **Extended security scanner** — 18 new rules: 7 agent-config (SEC-AGT-001–007), 5 MCP (SEC-MCP-001–005), 6 secret detection (SEC-SEC-006–011). New `agent-config` and `mcp` security categories with `fileGlob` filtering.
- **Learnings enhancements** — Hash-based content deduplication, frontmatter annotations, progressive disclosure with depth parameter, index entry extraction, and session learning promotion.
- **Onboarding funnel** — `harness setup` command, `doctor` health check, and first-run welcome experience.
- **CI pipeline hardening** — Coverage ratchet, benchmark regression gate, codecov integration, and post-publish smoke test workflow.

### Changed

- Progressive disclosure in `gather_context` via new `depth` parameter for layered context retrieval.
- Autopilot DONE state now promotes session learnings and suggests global learnings pruning.
- Autopilot APPROVE_PLAN replaced mandatory pause with conditional signal-based gate.
- Autopilot FINAL_REVIEW dispatch and findings handling integrated into phase lifecycle.

### Fixed

- Shell injection and `-n` flag bypass in hook scripts.
- `execFileSync` consistency and MCP-003 wildcard handling in security/hooks.
- O(1) dedup and redundant I/O in events and learnings modules.
- Roadmap sync guard replaced with directional protection and auto-sync.
- `promoteSessionLearnings` idempotency guard and budgeted learnings deduplication.
- `scanContent` docs, AGT-007 confidence, and regex precision in security scanner.

## 0.8.0 — 2026-03-27

### Added

- **Multi-language template system** — 5 language bases (Python, Go, Rust, Java, TypeScript) and 10 framework overlays (FastAPI, Django, Gin, Axum, Spring Boot, Next.js, React Vite, Express, NestJS, and existing Next.js). Language-aware resolution in `TemplateEngine` with `detectFramework()` auto-detection.
- **`--language` flag for `harness init`** — Explicit language selection with conflict validation. MCP `init_project` tool also accepts `language` parameter.
- **Framework conventions in AGENTS.md** — `harness init` appends framework-specific conventions to existing AGENTS.md files and persists tooling/framework metadata in `harness.config.json`.
- **Session sections in `manage_state`** — New actions for session-scoped accumulative state: read, append, status update, and archive operations with read-before-write safety.
- **Session section retrieval in `gather_context`** — New `sessions` include key for loading session section data.
- **Evidence gate for code review** — Coverage checking and uncited finding tagging in the review pipeline. `EvidenceCoverageReport` type, `tagUncitedFindings()`, and pipeline orchestrator integration with coverage reporting in output formatters.

### Changed

- Reduced cyclomatic complexity across all packages via function extraction and handler decomposition.
- Template schema expanded with `language`, `tooling`, and `detect` fields.
- `HarnessConfigSchema` template field extended with `language` and `tooling`.
- Package config skip logic added for non-JS existing projects.

### Fixed

- `detectFramework` file descriptor leak — wrapped in try/finally to prevent fd exhaustion.
- Evidence gate regex now supports `@` in scoped package paths (e.g., `@org/package`).
- `exactOptionalPropertyTypes` compliance in review conditional spread.
- Cross-device session archive with copy+remove fallback when `fs.rename` fails across filesystems.
- Enum constraints added to session section and status MCP schema properties.
- CI check warnings for entry points and doc coverage resolved.
- Platform-parity test normalization for cross-platform compatibility.

## 0.7.0 — 2026-03-27

### Added

- **Three-tier skill system** — 79 skills organized into Tier 1 (11 workflow), Tier 2 (19 maintenance), Tier 3 (43 domain), plus 6 internal skills. Includes skill dispatcher with tier-based loading, index builder, and stack profile detection.
- **30 new domain skills** — Tier 3 catalog covering API testing, chaos engineering, container security, data pipeline validation, DB migration safety, dependency license audit, feature flags, GraphQL schema review, incident response, infrastructure drift, ML ops, mobile testing, monorepo health, mutation testing, observability, OpenAPI validation, privacy compliance, queue health, rate limit design, real-time sync, schema evolution, search relevance, service mesh review, state machine verification, supply chain security, terraform review, visual regression, and WebSocket protocol testing.
- **`search_skills` MCP tool** — Search and discover skills from the catalog (46 total MCP tools).
- **`require-path-normalization` ESLint rule** — Requires path normalization for cross-platform compatibility.
- **`toPosix()` utility** — New helper in `@harness-engineering/core` for consistent cross-platform path separators.
- **`@harness-engineering/orchestrator` README** — Architecture diagram, quick start guide, core concepts, and API reference.

### Changed

- **Graph tools decomposition** — Split `graph.ts` (821 lines) into 9 focused modules under `tools/graph/`: `query-graph`, `search-similar`, `find-context-for`, `get-relationships`, `get-impact`, `ingest-source`, `detect-anomalies`, `ask-graph`, and shared utilities.
- **Check orchestrator refactor** — Extracted 8 handler functions from `runSingleCheck` switch statement, reducing cyclomatic complexity from 63 to ~10 per function.
- **Roadmap handler refactor** — Extracted 6 action handlers from `handleManageRoadmap` into standalone functions with shared `RoadmapDeps` interface.
- **Cross-platform path normalization** — `path.relative()` outputs normalized to POSIX separators across architecture collectors, constraint validators, doc coverage, context generators, entropy detectors, review scoper, glob helper, and CLI path utilities.
- Architecture baseline updated for pre-commit hook integration and refactored function signatures.
- Pre-commit hook now runs `harness check-arch` for earlier failure detection.
- Pre-push hook now runs `typecheck`.

### Fixed

- `check_docs` MCP tool and `harness add` command now honor the `docsDir` config field.
- Resolved `exactOptionalPropertyTypes` error in gather-context tool.
- Restored gemini-cli symlinks broken by tier classification.
- Core `VERSION` constant updated from 0.11.0 to 0.13.0.
- README tool count corrected (47→46), skill count corrected (49→79), ESLint rule count corrected (10→11).
- AGENTS.md skill breakdown corrected ("49 core + 30 domain" → "36 core + 43 domain"), `docs/specs/` → `docs/changes/`, `docs/api/` description updated, module boundaries expanded to all 7 packages.
- ESLint plugin README updated with 3 missing cross-platform rules.

## 0.6.0 — 2026-03-26

### Added

- **Efficient Context Pipeline** — Reduce token waste across the harness workflow while preserving quality.
  - **Session-scoped state**: All state files isolated per session under `.harness/sessions/<slug>/`, enabling parallel Claude Code windows without conflicts.
  - **Token-budgeted learnings**: `loadBudgetedLearnings()` with two-tier loading (session first, global second), recency sorting, relevance scoring, and configurable token budget.
  - **Session summaries**: Lightweight cold-start context (~200 tokens) via `writeSessionSummary()`, `loadSessionSummary()`, `listActiveSessions()`.
  - **Learnings pruning**: `harness learnings prune` command analyzes patterns, presents improvement proposals, and archives old entries.
  - **Lean agent dispatch**: Autopilot agents load their own context via `gather_context()` instead of receiving embedded file content.
- **Roadmap parser fix** — `manage_roadmap` no longer clobbers the roadmap file. Parser accepts both `### Feature: X` and `### X` formats.

### Changed

- All core state functions accept optional `session` parameter for session-scoped operation.
- `gather_context`, `manage_state`, and `emit_interaction` MCP tools accept `session` parameter.
- All 5 pipeline skill SKILL.md files updated with session summary write/read steps.
- Roadmap serializer outputs format matching actual roadmap files (no `Feature:`/`Milestone:` prefixes).

### Fixed

- Circular dependency in entropy types module.
- Roadmap parser/serializer format mismatch that caused `manage_roadmap add` to wipe all existing features.

## 0.5.0 — 2026-03-25

### Added

- **Constraint Sharing** — Install and uninstall shared constraint bundles across projects.
  - `harness install-constraints` with conflict detection, dry-run, `--force-local`/`--force-package`.
  - `harness uninstall-constraints` with lockfile-driven rule removal.
  - `removeContributions` function in `@harness-engineering/core` for programmatic rule cleanup.
- **Private Registry Support** — `--registry` flag for `install`, `search`, and `publish` commands with `.npmrc` token reading.
- **Local Install** — `harness install --from <path>` for installing skills from directories or tarballs.
- **Orchestrator Daemon** — New package `@harness-engineering/orchestrator` providing a long-lived daemon for agent lifecycle management.
  - Ink-based TUI and HTTP API for real-time monitoring.
  - Deterministic per-issue workspace management.
  - Pure state-machine core for robust dispatch/reconciliation.
- **Harness Docs Pipeline** — Orchestrated sequential documentation health check (drift, coverage, links).
- **Source Map Reference** — Comprehensive index of all project source files in documentation.

### Changed

- Documentation coverage increased to **84%** across the monorepo.
- Comprehensive JSDoc/TSDoc for core API packages.
- Hardened `@harness-engineering/core` and `@harness-engineering/cli` with resolved lint and type errors.
- Restricted orchestrator observability API to localhost for security.
- Updated `harness.config.json` to reflect actual dependency structure (added orchestrator layer, removed stale mcp-server references).

### Fixed

- `exactOptionalPropertyTypes` violation in CLI install command.
- Broken test imports in `core/test/blueprint/content-pipeline.test.ts`.
- 13 documentation drift items: stale mcp-server references, outdated version numbers, missing ESLint rule docs, undocumented deprecations.

### Deprecated

- `validateAgentsMap()` and `validateKnowledgeMap()` in `@harness-engineering/core` — use `Assembler.checkCoverage()` from `@harness-engineering/graph` instead.

## 0.4.0 — 2026-03-23

### Added

- **MCP server merged into CLI** — `@harness-engineering/mcp-server` absorbed into `@harness-engineering/cli`. A single `npm install -g @harness-engineering/cli` now provides both `harness` and `harness-mcp` binaries. The standalone `@harness-engineering/mcp-server` package is deprecated.
- Lint check in `assess_project` MCP tool with enforcement in execution skill
- Automatic roadmap sync embedded into pipeline skills
- Updated `release-readiness` skill to use `assess_project` with lint

### Fixed

- State cache invalidation on write to prevent stale hits in CI
- Redundant `undefined` removed from optional graph parameters
- `no-explicit-any` casts replaced with typed interfaces in `gather-context`
- Unified `paths.ts` with `findUpFrom` + `process.cwd()` fallback

## 0.3.0 — 2026-03-23

### Added

- **Agent workflow acceleration:** Redesigned `emit_interaction` with structured decision UX — every question now includes pros/cons per option, recommendation with confidence level, risk/effort indicators, and markdown table rendering
- **Composite MCP tools:** `gather_context` (parallel context assembly replacing 5 sequential calls), `assess_project` (parallel health checks replacing 6 sequential calls), `review_changes` (depth-controlled review with quick/standard/deep modes)
- **Batch decision mode** for `emit_interaction` — group low-risk decisions for approval as a set
- **Quality gate** on phase transitions — `emit_interaction` transition type now includes `qualityGate` with per-check pass/fail indicators
- **Response density control** — `mode: 'summary' | 'detailed'` parameter on `query_graph`, `detect_entropy`, `get_relationships`, `get_impact`, `search_similar`, and all composite tools
- **GraphStore singleton cache** with mtime-based invalidation and pending-promise dedup for concurrent access (LRU cap: 8 entries)
- **Learnings/failures index cache** with mtime invalidation and LRU eviction in state-manager
- **Parallelized CI checks** — `check-orchestrator` runs validate first, then 6 remaining checks via `Promise.all`
- **Parallelized mechanical checks** — docs and security checks run in parallel with explicit findings-merge pattern
- **GraphAnomalyAdapter** — Tarjan's articulation point detection, Z-score statistical outlier detection, overlap computation for graph anomaly analysis
- **`detect_anomalies` MCP tool** for graph-based anomaly detection
- 42 MCP tools total (was 40)

### Changed

- **Tool consolidation:** `manage_handoff` absorbed into `manage_state` (new `save-handoff`/`load-handoff` actions), `validate_knowledge_map` absorbed into `check_docs` (new `scope` parameter), `apply_fixes` absorbed into `detect_entropy` (new `autoFix` parameter)
- **All 7 core skills updated** (brainstorming, planning, execution, verification, code-review, autopilot, pre-commit-review) to use structured `InteractionOption` format, composite tools, and `qualityGate` transitions — both claude-code and gemini-cli platforms
- `emit_interaction` Zod schema now enforces structured options with `.min(2).max(10)`, recommendation required when options present, default index bounds check
- Pipe characters in user-supplied text escaped in markdown table rendering
- `review_changes` uses `execFileSync` instead of `execSync` for security hardening
- Zod error messages now include field paths for easier debugging

### Fixed

- Resolved stale `VERSION` constant in core (was `0.8.0`, should be `1.8.1`) causing incorrect update notifications
- Added `on_doc_check` to `ALLOWED_TRIGGERS` so `harness-docs-pipeline` skill validates correctly
- Extracted `packages/cli/src/version.ts` to read CLI version from `package.json` at runtime, preventing future version drift
- Added `./package.json` to CLI exports map for cross-package version resolution
- Updated MCP server to read CLI version from `package.json` with fallback to core `VERSION`
- Deprecated core `VERSION` export — consumers should read from `@harness-engineering/cli/package.json`
- Fixed graph-loader race condition where concurrent loads with different mtimes could cache stale data
- Fixed `gather_context` summary mode graph stripping (was accessing wrong property paths on graph context object)
- Updated README and docs/api MCP tool count to 42

## 0.2.0 — 2026-03-22

### Added

- Full cross-platform support (Windows, macOS, Linux) with mechanical enforcement
- CI matrix expanded to test on all 3 OSes with `fail-fast: false`
- ESLint rules `no-unix-shell-command` and `no-hardcoded-path-separator` for platform enforcement
- Root-level platform parity test suite (918 tests) scanning for 5 anti-pattern categories
- `.gitattributes` with `eol=lf` for consistent line endings on Windows
- Cross-platform Node.js scripts (`scripts/clean.mjs`, `copy-assets.mjs`, `copy-templates.mjs`) replacing Unix shell commands

### Fixed

- Normalized all `path.relative()`/`path.resolve()` outputs to forward slashes across 12 source files for Windows compatibility
- Fixed `fs.chmodSync` crash on Windows with platform guard
- Fixed hardcoded `/src/` path separators in eslint-plugin `path-utils.ts`
- Fixed `CodeIngestor` graph node ID mismatches on Windows (backslash in file IDs)
- Fixed `TemplateEngine` producing backslash `relativePath` values on Windows
- Fixed `check-phase-gate` spec path resolution failing on Windows
- Fixed `validate-findings` exclusion matching on Windows paths
- Fixed `update-checker` state file path resolution on Windows
- Fixed `CriticalPathResolver` returning backslash file paths on Windows
- Fixed dependency graph `nodes`/`edges` path mismatch breaking cycle detection on Windows
- Switched eslint-plugin build from `tsc` to `tsup` for ESM-compatible output

## 0.1.0 — 2026-03-21

### Added

- Initial public release of harness-engineering toolkit
- 7 packages: types, core, cli, eslint-plugin, linter-gen, mcp-server, graph
- 49 agent skills for Claude Code, 50 for Gemini CLI
- 12 agent personas (code-reviewer, architecture-enforcer, task-executor, documentation-maintainer, entropy-cleaner, graph-maintainer, parallel-coordinator, codebase-health-analyst, performance-guardian, security-reviewer, planner, verifier)
- 5 project templates (base, basic, intermediate, advanced, nextjs)
- 3 progressive examples (hello-world, task-api, multi-tenant-api)
- Comprehensive documentation with VitePress site
- `harness-release-readiness` skill — audits npm release readiness, dispatches maintenance skills in parallel, offers auto-fixes, tracks progress across sessions
- `harness-security-scan` skill — lightweight mechanical security scanning
- `harness-autopilot` skill — automated Plan → Implement → Verify → Review cycle
- BenchmarkRunner and ESLint performance rules (8 rules total)
- Progressive performance enforcement system
- Knowledge graph package (`@harness-engineering/graph`) for context assembly
- Usage section in README with code and CLI examples
- `.nvmrc` pinning Node.js to v22
- Performance entry points in `harness.config.json`
- Unified 7-phase code review pipeline with mechanical checks, AI fan-out agents, validation, deduplication, and output formatting
- Roadmap management module with parse, serialize, sync, and MCP tool support
- Background update checker with configurable interval and session notifications
- New MCP tools: `manage_roadmap`, `run_code_review`, `emit_interaction`
- Auto-transition support in skill lifecycle (brainstorming → planning → execution → verification → review)
- Interaction surface abstraction — skills migrated to platform-agnostic patterns
- 10 new skills: harness-soundness-review, harness-codebase-cleanup, harness-i18n, harness-i18n-workflow, harness-i18n-process, harness-roadmap, harness-docs-pipeline, harness-design, harness-design-web, harness-design-mobile
- i18n knowledge base with 20+ locale profiles, framework patterns, and industry verticals
- Entropy cleanup enhancements: dead export, commented-out code, orphaned dependency, and forbidden import fix creators
- `harness-ignore` inline suppression for security false positives
- `ForbiddenImportRule` type with alternative field for constraint enforcement
- Model tier resolver with provider defaults for review pipeline
- CI eligibility gate for review pipeline

### Changed

- **Breaking:** `@harness-engineering/cli` no longer provides the `harness-mcp` binary. Install `@harness-engineering/mcp-server` separately for MCP server support.
- Aligned dependency versions across all packages (`@types/node` ^22, `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3)
- Upgraded `review` command with `--comment`, `--ci`, `--deep`, and `--no-mechanical` flags

### Fixed

- Break cyclic dependency between `@harness-engineering/cli` and `@harness-engineering/mcp-server` — `pnpm build` now succeeds
- Fix `exactOptionalPropertyTypes` build error in `@harness-engineering/graph` DesignIngestor
- Added missing `license: "MIT"` field to `@harness-engineering/graph` package.json
- Added `.env` to `.gitignore` (previously only `.env*.local` was covered)
- Resolved 12+ documentation drift issues across README, AGENTS.md, docs/api/index.md, and guides
- Added `@harness-engineering/graph` to docs/api/index.md package list
- Enforce path sanitization across all MCP tools and harden crypto
- Resolve TypeScript strict-mode errors and platform parity gaps
- Prevent security agent strings from triggering SEC-INJ-001 scan
- Use atomic write (temp file + rename) to prevent corrupt update-checker state from concurrent writes
