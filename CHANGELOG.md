# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

## [Unreleased]

### Added

- Initial public release of harness-engineering toolkit
- 7 packages: types, core, cli, eslint-plugin, linter-gen, mcp-server, graph
- 37 agent skills for Claude Code, 38 for Gemini CLI
- 10 agent personas (code-reviewer, architecture-enforcer, task-executor, documentation-maintainer, entropy-cleaner, graph-maintainer, parallel-coordinator, codebase-health-analyst, performance-guardian, security-reviewer)
- 5 project templates (base, basic, intermediate, advanced, nextjs)
- 3 progressive examples (hello-world, task-api, multi-tenant-api)
- Comprehensive documentation with VitePress site
- `harness-release-readiness` skill — audits npm release readiness, dispatches maintenance skills in parallel, offers auto-fixes, tracks progress across sessions
- `harness-security-scan` skill — lightweight mechanical security scanning
- `harness-autopilot` skill — automated Plan → Implement → Verify → Review cycle
- BenchmarkRunner and ESLint performance rules
- Progressive performance enforcement system
- Knowledge graph package (`@harness-engineering/graph`) for context assembly

### Fixed

- Added missing `license: "MIT"` field to `@harness-engineering/graph` package.json
- Resolved 12+ documentation drift issues across README, AGENTS.md, and guides
