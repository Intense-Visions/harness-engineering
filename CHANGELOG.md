# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

## [Unreleased]

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
