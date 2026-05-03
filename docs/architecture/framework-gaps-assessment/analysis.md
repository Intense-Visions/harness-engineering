## Codebase Analysis: Framework Gaps Assessment

### Current State Summary

- 7 packages, ~33,500 LOC, 258 test files (~85-90% coverage)
- 49 skills (Claude Code), 12 personas, 37 MCP tools, 8 resources
- Knowledge graph with LokiJS, 4 external connectors
- Multi-platform: Claude Code + Gemini CLI
- CI: GitHub Actions (Ubuntu/Windows/macOS), Turbo monorepo

### Key Strengths

- Mechanical constraint enforcement (unique in market)
- Lean footprint vs competitors (Gas Town 189K LOC, BMAD 655 files)
- Knowledge graph as unified context layer
- Result<T,E> error handling throughout
- Progressive adoption levels (basic → intermediate → advanced)

### Key Weaknesses Identified

**Onboarding & DX**

- No 5-minute quickstart walkthrough
- No interactive CLI prompts for init (requires --level flag knowledge)
- No shell completion (bash/zsh)
- No "did you mean?" for mistyped commands
- No troubleshooting section
- No visual cheat sheet for command/skill selection

**Testing & Reliability**

- 8+ security rule implementations completely untested
- Coverage thresholds not enforced in CI (warnings only)
- No concurrent write locking on state files

**Architecture & Extensibility**

- No custom tool plugin system (tools hardcoded in MCP server)
- LokiJS in-memory only (no persistent/distributed graph option)
- Manual tool registry maintenance (error-prone at scale)
- Learnings/failures parsed as Markdown (brittle)

**Skills & Feature Completeness**

- Missing domains: deployment, database, API design, monitoring, auth
- Slash commands invisible until manually generated
- Skill dependencies declarative but not enforced
- GSD orchestration ~70% complete (lacks metrics, escalation)

**Competitive Gaps**

- No IDE integration (VS Code, JetBrains, Cursor)
- No browser automation
- No multi-provider model routing
- No enterprise governance (RBAC, audit trails)
- GitHub-only CI (no GitLab, Jenkins, CircleCI)
- No community channels (Discord/Slack), no social presence
- No skill marketplace
