## Codebase Analysis: Awesome Claude Code Integration

**Date:** 2026-03-29

### Current Patterns

- **Skill system:** 79 skills with YAML metadata + SKILL.md documentation, 6 cognitive modes, stack-aware dispatch
- **Persona system:** 12 agent personas (enforcer, reviewer, planner, verifier, etc.) with YAML definitions
- **Orchestrator:** Event-sourced daemon with candidate selection, concurrency control, 2 backends (Claude, Mock)
- **Knowledge graph:** Multi-source (code, git, docs, Jira, Slack, Confluence, CI) with ContextQL queries
- **Context priming:** `gather_context` assembles 5 constituents (state, learnings, handoff, graph, validation) with token budgeting
- **Session management:** Append-only sections, cross-skill state, archival, restoration, handoff
- **Constraint enforcement:** 11 ESLint rules, 7-layer architecture, forbidden imports, boundary schemas
- **Multi-platform:** Claude Code + Gemini CLI generation

### Integration Points

- **MCP server:** 46 tools + 8 resources — primary extension surface for new capabilities
- **CLI commands:** 40+ commands — can add new commands for usage tracking, session search, etc.
- **Skill dispatcher:** Auto-discovers skills — new skills integrate automatically
- **Hook system:** Workspace lifecycle hooks in orchestrator — could extend to Claude Code hooks
- **Graph connectors:** Extensible interface — can add connectors for new data sources
- **Template system:** 3 adoption levels × 5 languages × 10 frameworks — can add hook templates

### Gap Analysis (12 Dimensions)

| Capability               | Status                  | Gap Severity    |
| ------------------------ | ----------------------- | --------------- |
| Orchestration            | ✅ Full                 | None            |
| Hook SDK                 | ⚠️ Workspace-level only | Medium          |
| Status line              | ❌ None                 | Low (cosmetic)  |
| Session management       | ✅ Advanced             | None            |
| Usage/cost tracking      | ⚠️ Token counts only    | Medium          |
| Context priming          | ✅ Sophisticated        | None            |
| Config switching         | ❌ None                 | Low             |
| Docker execution         | ⚠️ Planned only         | High (security) |
| Multi-platform           | ✅ 2 platforms          | Low             |
| Voice/speech             | ❌ None                 | Very Low        |
| Agent config linting     | ⚠️ AGENTS.md only       | Medium          |
| Graph visualization      | ⚠️ Mermaid export       | Low             |
| Prompt injection defense | ❌ None                 | High (security) |
| Desktop notifications    | ❌ None                 | Low             |
| Session browsing/search  | ❌ None                 | Medium          |

### Technical Debt

- `sandboxPolicy` config field exists but has no implementation — Container Use could fill this
- Token tracking captures counts but has no cost multiplier — incomplete observability story
- No CLAUDE.md validation despite generating them via templates
- Graph export is static (JSON/Mermaid) — no interactive exploration

### Resource Classification (200+ items evaluated)

- **Tier 1 — High Value (8):** Fill real gaps in security, safety, and DX
- **Tier 2 — Pattern Inspiration (7):** Worth studying for ideas
- **Tier 3 — Nice-to-Have (5):** Low effort, real value
- **Tier 4 — Competitive Intelligence (6):** Market reference
- **Tier 5 — Not Relevant (~175+):** Already covered, wrong category, or cosmetic
