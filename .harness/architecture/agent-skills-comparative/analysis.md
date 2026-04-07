# Codebase Analysis: agent-skills vs Harness Engineering

## Project Comparison

| Dimension    | agent-skills                            | harness engineering                                |
| ------------ | --------------------------------------- | -------------------------------------------------- |
| Repository   | github.com/addyosmani/agent-skills      | harness-engineering (this repo)                    |
| Skills       | 19 + 1 meta-skill                       | 83 (6 internal)                                    |
| Format       | Pure Markdown, no runtime               | YAML + Markdown + MCP runtime                      |
| State        | Stateless                               | Two-tier persistent (global + session)             |
| Composition  | Slash commands + cross-references       | Dependency graph + fan-out pipelines + autopilot   |
| Verification | Checklist per skill                     | Quick gate + deep audit (EXISTS/SUBSTANTIVE/WIRED) |
| Distribution | Claude plugin marketplace, 6+ platforms | MCP server + slash commands + agents               |
| License      | MIT                                     | Proprietary                                        |

## Current Patterns in Harness

### Anti-Rationalization (partial)

Present in some skills as `## Rationalizations to Reject`:

- `harness-architecture-advisor/SKILL.md` — 6 rationalizations (3 universal, 3 domain-specific)
- `harness-tdd/SKILL.md` — present in Gates section as implicit rebuttals
- `harness-planning/SKILL.md` — present as "Red Flags"

NOT present as a standardized required section. Format varies: some use prose, some use lists, none use the table format.

### MCP Dependency (full)

All skills that manage state, verify, or transition require MCP tools:

- `emit_interaction` — 38+ skills
- `gather_context` — used at session start by execution, debugging, autopilot
- `manage_state` — used by planning, brainstorming, execution
- `assess_project` — used as quick gate after every task

Without MCP: skills can be read as process guides but cannot verify, transition, or persist state.

### Context Management (implicit)

No explicit context budget system. Relevant patterns:

- `validate-context-engineering` skill exists but validates context quality, not quantity
- Rigor levels (`fast/standard/thorough`) implicitly manage context depth
- No token budget field in skill.yaml
- No progressive loading protocol for skill content

### Code Protection (absent)

No equivalent to simplify-ignore. Skills that modify code (`harness-refactoring`, `cleanup-dead-code`, `enforce-architecture`) have no mechanism to protect annotated regions.

## Integration Points

### Skill Authoring Spec

Location: `agents/skills/claude-code/harness-skill-authoring/SKILL.md`
Impact: Any new required section must be added here and validated by skill authoring tooling.

### skill.yaml Schema

Location: Defined implicitly across 83 skill.yaml files
Impact: New fields (`context_budget`, `degraded_mode`) would need to be optional to maintain backward compatibility.

### MCP Server

Location: `packages/core/`, `packages/cli/`
Impact: Degraded mode requires SKILL.md to encode fallback instructions for each MCP call.

## Technical Debt

- **Inconsistent Rationalizations sections**: Some skills have them, most don't. Format varies when present.
- **No context budget enforcement**: As skill count grows, context pressure will increase without a management mechanism.
- **No protected regions**: Refactoring skills can modify any code, including performance-critical or compliance-required sections.

## Relevant Files

- `agents/skills/claude-code/harness-skill-authoring/SKILL.md` — skill format spec
- `agents/skills/claude-code/harness-architecture-advisor/SKILL.md` — example of rationalizations section
- `agents/skills/claude-code/harness-tdd/SKILL.md` — example of gates as implicit anti-rationalization
- `agents/skills/claude-code/harness-execution/SKILL.md` — MCP dependency hotspot
- `agents/skills/claude-code/harness-autopilot/SKILL.md` — orchestration and rigor levels
- `agents/skills/claude-code/harness-verification/SKILL.md` — three-tier verification
