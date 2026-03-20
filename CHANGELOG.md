# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

## [Unreleased]

### Added

- Initial public release of harness-engineering toolkit
- 7 packages: types, core, cli, eslint-plugin, linter-gen, mcp-server, graph
- 42 agent skills for Claude Code, 43 for Gemini CLI
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

### Changed

- **Breaking:** `@harness-engineering/cli` no longer provides the `harness-mcp` binary. Install `@harness-engineering/mcp-server` separately for MCP server support.
- Aligned dependency versions across all packages (`@types/node` ^22, `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3)

### Fixed

- Break cyclic dependency between `@harness-engineering/cli` and `@harness-engineering/mcp-server` — `pnpm build` now succeeds
- Fix `exactOptionalPropertyTypes` build error in `@harness-engineering/graph` DesignIngestor
- Added missing `license: "MIT"` field to `@harness-engineering/graph` package.json
- Added `.env` to `.gitignore` (previously only `.env*.local` was covered)
- Resolved 12+ documentation drift issues across README, AGENTS.md, docs/api/index.md, and guides
- Added `@harness-engineering/graph` to docs/api/index.md package list
