## Codebase Analysis: PatternsDev/skills Adoption Opportunities

### What PatternsDev/skills Is

A **knowledge library** of 58 frontend skills (27 JS, 19 React, 11 Vue) distilled from [patterns.dev](https://patterns.dev) by Addy Osmani/Lydia Hallie. Each skill is a single `SKILL.md` with YAML frontmatter following the [agentskills.io](https://agentskills.io) open specification. Pure content — no infrastructure, no build system, no executable code.

### PatternsDev Strengths

1. **Granular decomposition** — 1 concept = 1 skill (vs Vercel's 3 monolithic skills with 57+ rules each)
2. **agentskills.io spec compliance** — portable across 30+ agent products (Claude Code, Cursor, Gemini CLI, Copilot, Codex, etc.)
3. **Non-standard extensions** — `paths` (glob-based activation targeting), `related_skills` (cross-references), `context: fork` (context loading hint)
4. **Progressive disclosure** — metadata (~100 tokens) → instructions (<5K tokens) → details (as needed)
5. **Educational depth** — "Why" explanations alongside "What to do" directives
6. **Framework-agnostic** — React patterns work across Vite, Remix, Next.js, plain React
7. **Forward-looking content** — `react-2026`, `ai-ui-patterns` covering React 19, Compiler, vibe coding trends

### Harness Engineering Strengths (for comparison)

1. **81 skills** across Tier 1-3 with dispatch infrastructure
2. **Cognitive modes** (6 standard + 2 extended) — behavioral differentiation per skill
3. **Rigid/flexible type system** — structured phases vs interactive flow
4. **Health signal integration** — skills address drift, dead-code, coupling, coverage signals
5. **Knowledge graph integration** — 17 graph-aware skills (transformed, enhanced, enabled)
6. **Mechanical constraints** — linters + layer enforcement (unique differentiator)
7. **Persona system** — 12 personas mapping to skill workflows
8. **Dispatch engine** — weighted scoring (keyword 35%, name 20%, stack 20%, recency 15%, description 10%)
9. **Multi-platform** — 81 skills replicated across claude-code, gemini-cli, codex, cursor
10. **State persistence** — session continuity for autopilot, debugging, architecture-advisor

### Head-to-Head Comparison

| Dimension                  | PatternsDev                                | Harness Engineering                                             |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| **Skill count**            | 58                                         | 81                                                              |
| **Domain**                 | Frontend patterns (JS/React/Vue)           | Full SDLC (planning → deployment)                               |
| **Skill type**             | Knowledge/educational                      | Behavioral/workflow                                             |
| **Granularity**            | 1 concept = 1 skill                        | 1 workflow = 1 skill                                            |
| **Format**                 | agentskills.io spec                        | Custom skill.yaml + SKILL.md                                    |
| **Metadata**               | Minimal frontmatter                        | Rich (cognitive_mode, tier, triggers, addresses, stack_signals) |
| **Cross-references**       | `related_skills` field                     | `depends_on` + health signal graph                              |
| **Activation**             | `paths` glob matching                      | Dispatch engine (health + keyword + stack scoring)              |
| **Portability**            | 30+ agents via spec                        | 4 platforms (custom format)                                     |
| **Executable**             | No (pure reference)                        | Yes (phases, state, MCP tools)                                  |
| **Infrastructure**         | Zero (Markdown-only repo)                  | Full (Zod schemas, dispatch engine, MCP tools)                  |
| **Progressive disclosure** | 3-tier (metadata → instructions → details) | 2-tier (skill.yaml → SKILL.md)                                  |

### Key Gaps in Harness Identified by Comparison

1. **No agentskills.io spec compliance** — harness uses custom format, limiting portability
2. **No `paths`-style activation targeting** — harness dispatches by health signals, not file globs
3. **No `related_skills` cross-references** — only `depends_on` (execution dependency, not conceptual)
4. **No progressive disclosure** — SKILL.md is loaded fully or not at all
5. **No frontend pattern skills** — harness has architecture/infra/testing but no design pattern library
6. **No educational "why" content** — harness skills are procedural, not pedagogical
7. **Skill size inconsistency** — some SKILL.md files exceed 1000 lines with no tier-based loading

### Relevant Files

- `packages/cli/src/skill/schema.ts` — Zod schema for skill.yaml (where format changes happen)
- `packages/cli/src/skill/dispatcher.ts` — Dispatch engine (where activation logic lives)
- `packages/cli/src/skill/skill-executor.ts` — Skill loader (where progressive disclosure would be added)
- `agents/skills/claude-code/` — Skill catalog root (where new skills would land)
