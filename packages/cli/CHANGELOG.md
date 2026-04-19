# @harness-engineering/cli

## 1.25.1

### Patch Changes

- 370cefb: Fix hook refresh failure after global install. `resolveHookSourceDir()` path resolution failed in bundled dist layout, and `copy-assets.mjs` was not copying hook scripts to `dist/hooks/`.

## 1.25.0

### Minor Changes

- f1bc300: Add `harness validate --agent-configs` for hybrid agent-config validation.
  - Preferred path shells out to the [agnix](https://github.com/agent-sh/agnix) binary when it
    is installed (385+ rules across CLAUDE.md, hooks, agents, skills, MCP).
  - When agnix is unavailable (or disabled via `HARNESS_AGNIX_DISABLE=1`), the command runs a
    built-in TypeScript fallback rule set (`HARNESS-AC-*`) covering broken agents, invalid
    hooks, unreachable skills, oversize CLAUDE.md, malformed MCP entries, persona references,
    and `.agnix.toml` sanity.
  - `harness init` now ships a default `.agnix.toml` so the agnix path works with no extra
    configuration.
  - Supports `--strict`, `--agnix-bin`, `--json`, and `HARNESS_AGNIX_BIN` env override.

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
  - @harness-engineering/orchestrator@0.2.8
  - @harness-engineering/dashboard@0.1.5

## 1.24.3

### Patch Changes

- 46999c5: Fix `harness dashboard` returning 404 on all routes by serving built client static files from the Hono API server with SPA fallback.
- 802a1dd: Fix `search_skills` returning irrelevant results and compaction destroying skill content.
  - Index all non-internal skills regardless of tier so the router can discover Tier 1/2 skills
  - Add minimum score threshold (0.25) to filter noise from incidental substring matches
  - Fix `resultToMcpResponse` double-wrapping strings with `JSON.stringify`, which collapsed newlines and caused truncation to drop all content
  - Truncate long lines to fit budget instead of silently skipping them; cap marker cost at 50% of budget
  - Exempt 12 tools from lossy truncation (run_skill, emit_interaction, manage_state, etc.) — use structural-only compaction for tools whose output must arrive complete

- Updated dependencies [46999c5]
- Updated dependencies [802a1dd]
  - @harness-engineering/dashboard@0.1.4
  - @harness-engineering/core@0.21.4
  - @harness-engineering/orchestrator@0.2.7

## 1.24.1

### Patch Changes

- 5bbad27: Fix `harness update` to check all installed packages for updates, not just CLI. Adds `--force` and `--regenerate` flags.

## 1.24.0

### Minor Changes

- Skill dispatcher enhancements, knowledge skill infrastructure, and structural improvements
  - Add `related_skills` traversal and knowledge auto-injection (cap N=3) to skill dispatcher
  - Add `paths` glob dimension to skill scoring (0.20 weight)
  - Add NL router skill with `command_name` override
  - Add `--skills-dir`, bulk install, global skills, and GitHub source to install command
  - Replicate knowledge skills across gemini-cli, cursor, and codex platforms
  - Add `return` after `process.exit()` calls for TypeScript control-flow correctness
  - Replace `!!` with `Boolean()` for explicit boolean coercion in integrations list
  - Reduce Tier 2 structural complexity across CLI commands

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.21.2
  - @harness-engineering/graph@0.4.2
  - @harness-engineering/linter-gen@0.1.6
  - @harness-engineering/orchestrator@0.2.6
  - @harness-engineering/types@0.9.1

## 1.23.2

### Patch Changes

- Reduce cyclomatic complexity in `traceability` command
- Updated dependencies
  - @harness-engineering/core@0.21.1 — fix blocked status corruption in external sync

## 1.23.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.21.0 — roadmap sync: remove auto-assignee, add title-based dedup, single fetch per cycle

## 1.23.0

### Minor Changes

- Add `assignee` field to `manage_roadmap update` action

  The `update` action now accepts an `assignee` parameter that delegates to `assignFeature()` for proper assignment history tracking (new assignment and reassignment with unassigned + assigned records). Because `update` is a mutating action, `triggerExternalSync` fires automatically — fixing the bug where the roadmap pilot skill bypassed sync by calling `assignFeature()` directly.

## 1.22.0

### Minor Changes

- Predictive architecture failure analysis, spec-to-implementation traceability, architecture decay timeline, and skill recommendation engine

## 1.21.0

### Minor Changes

- Return readable markdown from emit_interaction instead of JSON blob

  Split the single JSON content item into dual items: rendered markdown first (audience: user+assistant) and metadata JSON second (audience: assistant), with MCP audience annotations. This makes emit_interaction output readable on Gemini CLI and other clients that display raw MCP tool responses.

### Patch Changes

- Fix search_skills to find skills by name and description, not just keywords

## 1.20.1

### Patch Changes

- Fix injection scanner false positives on trusted MCP tool output

  The sentinel injection guard was scanning output from all MCP tools, including harness-internal tools like `run_skill` and `gather_context` that return project documentation and state. Skill docs containing legitimate patterns (e.g., `<context>` XML tags, "auto-approve" feature descriptions) triggered INJ-CTX-003 and INJ-PERM-003, tainting the session and blocking git operations.

  Added `trustedOutputTools` option to the injection guard middleware. All harness MCP tools are marked as trusted (opt-in), skipping output scanning while preserving input scanning. New tools default to untrusted.

## 1.20.0

### Minor Changes

- Load project `.env` for external sync — The MCP server's `triggerExternalSync` now loads `.env` from the project root when `GITHUB_TOKEN` is not already in the environment, fixing token discovery when the MCP server's working directory differs from the project.

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.19.0 — GitHub sync assignee push and auto-population

## 1.19.0

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.18.0 — GitHub milestone sync, feature type labels, rate limit retry

## 1.18.0

### Minor Changes

- Environment configuration via `.env` file
  - **dotenv support** — Added `dotenv` as a runtime dependency. Both CLI entry points (`harness`, `harness-mcp`) now load `.env` from the working directory at startup via `import 'dotenv/config'`.
  - **`.env.example`** — New file at repo root documenting all known environment variables: API keys (GITHUB_TOKEN, CONFLUENCE_API_KEY, CONFLUENCE_BASE_URL, JIRA_API_KEY, JIRA_BASE_URL, SLACK_API_KEY), integrations (PERPLEXITY_API_KEY), feature flags (HARNESS_NO_UPDATE_CHECK, CI), and server config (PORT).
  - **`.gitignore` hardening** — Broadened env file patterns from `.env` / `.env*.local` to `.env*` with `!.env.example` exception, catching all variants (`.env.production`, `.env.staging`, etc.).

## 1.17.0

### Minor Changes

- Roadmap sync, auto-pick, and assignment
  - **External tracker sync** — Bidirectional sync between roadmap.md and GitHub Issues via `TrackerSyncAdapter` interface. Split authority: roadmap owns planning fields, GitHub owns execution/assignment. Sync fires on every state transition (task-start, task-complete, phase-start, phase-complete, save-handoff, archive_session).
  - **Auto-pick pilot** — New `harness-roadmap-pilot` skill with AI-assisted next-item selection. Two-tier scoring: explicit priority first (P0-P3), then weighted position/dependents/affinity score. Routes to brainstorming (no spec) or autopilot (spec exists).
  - **Assignment with affinity** — Assignee, Priority, and External-ID fields on roadmap features. Assignment history section in roadmap.md enables affinity-based routing. Reassignment produces audit trail (unassigned + assigned records).
  - **New types** — `Priority`, `AssignmentRecord`, `ExternalTicket`, `ExternalTicketState`, `SyncResult`, `TrackerSyncConfig` in @harness-engineering/types.
  - **Config schema** — `TrackerConfigSchema` and `RoadmapConfigSchema` added to `HarnessConfigSchema` for validated tracker configuration.

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.7.0
  - @harness-engineering/core@0.17.0
  - @harness-engineering/graph@0.3.5
  - @harness-engineering/orchestrator@0.2.5

## 1.16.0

### Minor Changes

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

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.16.0
  - @harness-engineering/types@0.6.0
  - @harness-engineering/orchestrator@0.2.4
  - @harness-engineering/graph@0.3.4

## 1.15.0

### Minor Changes

- **Hooks system** — 6 hook scripts (`block-no-verify`, `cost-tracker`, `pre-compact-state`, `protect-config`, `quality-gate`, `profiles`) with profile tiers (minimal/standard/strict). CLI commands `hooks init`, `hooks list`, `hooks remove` for managing Claude Code hooks via `settings.json` merge.
- **Code navigation MCP tools** — Register `code_outline`, `code_search`, and `code_unfold` tools in the MCP server, powered by the new core code-nav module.
- **Event timeline in `gather_context`** — Structured event log integration for richer context assembly.
- **Learnings progressive disclosure** — Depth parameter in `gather_context` and `loadBudgetedLearnings` for layered context retrieval. Frontmatter annotations and index entry extraction.
- **Onboarding funnel** — `harness setup` command, `doctor` health check, and first-run welcome experience.
- **Session learning promotion** — Autopilot DONE state promotes session learnings and suggests pruning.

### Patch Changes

- Fix shell injection and `-n` flag bypass in hook scripts
- Fix `execFileSync` consistency and MCP-003 wildcard in security/hooks
- Fix stale scripts, malformed settings, and fallback error in hooks CLI
- Fix roadmap sync guard with directional protection
- Updated dependencies
  - @harness-engineering/core@0.15.0
  - @harness-engineering/types@0.5.0

## 1.14.0

### Minor Changes

- **Multi-language template system** — 5 language bases (Python, Go, Rust, Java, TypeScript) and 10 framework overlays (FastAPI, Django, Gin, Axum, Spring Boot, Next.js, React Vite, Express, NestJS). Language-aware resolution in `TemplateEngine` with `detectFramework()` auto-detection.
- **`--language` flag** — Explicit language selection for `harness init` with conflict validation against detected framework.
- **Framework conventions** — `harness init` appends framework-specific conventions to existing AGENTS.md and persists tooling/framework metadata in `harness.config.json`.
- **Session sections in `manage_state`** — New session section actions (read, append, status update) with schema-validated definitions.
- **Session section retrieval in `gather_context`** — New `sessions` include key for loading session section data.
- **MCP `init_project` enhancements** — Accepts `language` parameter and persists tooling metadata.

### Patch Changes

- Fix `detectFramework` file descriptor leak with try/finally guard
- Fix enum constraints on session section and status MCP schema properties
- Reduce cyclomatic complexity across template and tool modules
- Updated dependencies
  - @harness-engineering/core@0.14.0
  - @harness-engineering/types@0.4.0

## 1.13.1

### Patch Changes

- **Graph tools decomposition** — Split `graph.ts` (821 lines) into 9 focused modules under `tools/graph/`: `query-graph`, `search-similar`, `find-context-for`, `get-relationships`, `get-impact`, `ingest-source`, `detect-anomalies`, `ask-graph`, and shared utilities.
- **Roadmap handler refactor** — Extracted 6 action handlers from `handleManageRoadmap` into standalone functions with shared `RoadmapDeps` interface.
- **Three-tier skill loading** — New `search_skills` MCP tool (46 total). Skill dispatcher with tier-based loading, index builder, and stack profile detection.
- **`check_docs` docsDir fix** — `check_docs` MCP tool and `harness add` command now honor the `docsDir` config field.
- **Cross-platform path fix** — `path.relative()` outputs normalized to POSIX separators across glob helper and path utilities.
- **Gather-context fix** — Resolved `exactOptionalPropertyTypes` error in gather-context tool.
- MCP tool count test assertions updated from 45 to 46.
- Updated dependencies
  - @harness-engineering/core@0.13.1
  - @harness-engineering/orchestrator@0.2.3

## 1.13.0

### Minor Changes

- Efficient Context Pipeline: session support in MCP tools, learnings prune command, roadmap parser fix
  - **`harness learnings prune`**: New CLI command that analyzes global learnings for recurring patterns, presents improvement proposals, and archives old entries keeping 20 most recent
  - **`gather_context` session support**: Added `session` and `learningsBudget` parameters for session-scoped context loading with token-budgeted learnings
  - **`manage_state` session support**: All 7 actions (show, learn, failure, archive, reset, save-handoff, load-handoff) now accept `session` parameter for session-scoped state
  - **`emit_interaction` session support**: Handoff writes respect session scoping when `session` parameter is provided
  - **Roadmap parser fix**: `manage_roadmap` no longer clobbers the roadmap file — parser accepts both `### Feature: X` and `### X` formats, serializer outputs format matching actual roadmap

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.13.0
  - @harness-engineering/types@0.3.1

## 1.12.0

### Minor Changes

- Add constraint sharing commands and private registry support
  - `harness install-constraints` — install shared constraint bundles with conflict detection, dry-run mode, and `--force-local`/`--force-package` resolution
  - `harness uninstall-constraints` — remove contributed rules using lockfile-driven tracking
  - `harness install --from` — install skills from local paths (directories or tarballs)
  - `harness install --registry` / `harness search --registry` / `harness publish --registry` — private registry support with `.npmrc` token reading
  - Upgrade detection in `install-constraints` (uninstall old version before installing new)
  - Fix `exactOptionalPropertyTypes` violation in install command

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.12.0
  - @harness-engineering/orchestrator@0.2.1

## 1.11.0

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
  - @harness-engineering/orchestrator@0.2.0
  - @harness-engineering/core@0.11.0
  - @harness-engineering/types@0.3.0
  - @harness-engineering/graph@0.3.2
  - @harness-engineering/linter-gen@0.1.3

## 1.10.0

### Minor Changes

- **Merge `@harness-engineering/mcp-server` into CLI** — the MCP server (42 tools, 8 resources) now ships as part of the CLI package. Installing `@harness-engineering/cli` provides both `harness` and `harness-mcp` binaries.
  - Move source to `packages/cli/src/mcp/` (server, tools, resources, utils)
  - Move tests to `packages/cli/tests/mcp/` (37 test files, 889 tests)
  - Add `harness mcp` subcommand and `harness-mcp` bin entry
  - Add `@modelcontextprotocol/sdk` as dependency (externalized in tsup)
  - Re-export `createHarnessServer`, `startServer`, `getToolDefinitions` from CLI index
  - `@harness-engineering/mcp-server` is now deprecated
- Add lint check to `assess_project` tool with enforcement in execution skill
- Embed automatic roadmap sync into pipeline skills
- Update `release-readiness` skill to use `assess_project` with lint

### Patch Changes

- Replace `no-explicit-any` casts with typed interfaces in `gather-context`
- Unify `paths.ts` with `findUpFrom` + `process.cwd()` fallback
- Updated dependencies
  - @harness-engineering/core@0.10.1
  - @harness-engineering/graph@0.3.1

## 1.9.0

### Minor Changes

- Pick up composite MCP tools (`gather_context`, `assess_project`, `review_changes`), agent workflow acceleration, and `detect_anomalies` tool via updated mcp-server

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.10.0
  - @harness-engineering/graph@0.3.0

## 1.8.0

### Minor Changes

- Upgrade `review` command with `--comment`, `--ci`, `--deep`, and `--no-mechanical` flags for the unified 7-phase review pipeline
- Add update-check hooks with startup background check and notification helpers
- Read `updateCheckInterval` from project config in update-check hooks
- Add `parseConventionalMarkdown` utility for interaction surface patterns

### Patch Changes

- Resolve TypeScript strict-mode errors and platform parity gaps
- Updated dependencies
  - @harness-engineering/core@0.9.0
  - @harness-engineering/types@0.2.0

## 1.7.0

### Minor Changes

- Remove `harness-mcp` binary from CLI package to break cyclic dependency with `@harness-engineering/mcp-server`. The `harness-mcp` binary is now provided exclusively by `@harness-engineering/mcp-server`. Users who install the CLI globally should also install `npm install -g @harness-engineering/mcp-server` for MCP server support.
- Remove `@harness-engineering/mcp-server` from production dependencies

### Patch Changes

- Align dependency versions across workspace: `@types/node` ^22, `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3

## 1.6.2

### Patch Changes

- Bundle workspace packages into CLI dist so global install works without sibling packages

## 1.6.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.2.1

## 1.6.0

### Minor Changes

- Add agent definition generator for persona-based routing
- Add 5 new graph-powered skills: harness-impact-analysis, harness-dependency-health, harness-hotspot-detector, harness-test-advisor, harness-knowledge-mapper
- Add 2 new personas: Graph Maintainer, Codebase Health Analyst
- Update all 12 Tier-1/Tier-2 skill SKILL.md files with graph-aware context gathering notes
- Add graph refresh steps to 8 code-modifying skills
- Add platform parity lint rule (platform-parity.test.ts) ensuring claude-code and gemini-cli skills stay in sync
- Update 3 existing personas with graph skill references

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.8.0
  - @harness-engineering/graph@0.2.0

## 1.5.0

### Minor Changes

- Discover project-local skills in `generate-slash-commands` by default instead of only finding built-in global skills
  - New `--include-global` flag merges built-in skills alongside project skills
  - Project skills take precedence over global skills on name collision
  - Falls back to global skills when run outside a project (backward compatible)
  - Helpful message when no skills are found with guidance on `--include-global` and `create-skill`
- Export `SkillSource` type from package index

### Patch Changes

- Fix `create-skill` to scaffold with both `claude-code` and `gemini-cli` platforms by default

## 1.4.0

### Patch Changes

- Fix `update` command to use `@latest` per package instead of a single version

## 1.3.0

### Minor Changes

- Add CI/CD integration commands and documentation
  - New `harness ci check` command: runs all harness checks (validate, deps, docs, entropy, phase-gate) with structured JSON output and meaningful exit codes
  - New `harness ci init` command: generates CI config for GitHub Actions, GitLab CI, or a generic shell script
  - New CI types: `CICheckReport`, `CICheckName`, `CIPlatform`, and related interfaces
  - Core `runCIChecks` orchestrator composing existing validation into a single CI entrypoint
  - 4 documentation guides: automation overview, CI/CD validation, issue tracker integration, headless agents
  - 6 copy-paste recipes: GitHub Actions, GitLab CI, shell script, webhook handler, Jira rules, headless agent action

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.7.0

## 1.2.2

### Patch Changes

- Fix slash command descriptions not appearing in Claude Code by moving YAML frontmatter to line 1

## 1.2.1

### Patch Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.

- Updated dependencies [dc88a2e]
  - @harness-engineering/core@0.6.0

## 1.1.1

### Patch Changes

- Fix setup-mcp to write Claude Code config to .mcp.json (not .claude/settings.json), add Gemini trusted folder support, fix package name to @harness-engineering/mcp-server, and export CLI functions for MCP server integration.

## 1.1.0

### Minor Changes

- Add setup-mcp command and auto-configure MCP server during init for Claude Code and Gemini CLI

## 1.0.2

### Patch Changes

- Bundle agents (skills + personas) into dist for global install support

## 1.0.1

### Patch Changes

- Bundle templates into dist for global install support
