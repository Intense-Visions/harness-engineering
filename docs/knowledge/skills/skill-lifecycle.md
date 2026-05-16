---
type: business_process
domain: skills
tags: [skills, lifecycle, dispatch, discovery, activation, recommendation]
---

# Skill Lifecycle

Skills move through discovery, dispatch, execution, and transition stages within the harness runtime.

## Discovery

The skill index is built by scanning the `agents/skills/` directory tree. Each `skill.yaml` is parsed and compiled into `skills-index.json`, which maps skill names to their metadata (triggers, platforms, tier, cognitive mode). The index is regenerated on `harness init` and during CI doc generation.

## Dispatch (3 Paths)

1. **CLI** -- `harness skill run <skill-name>` loads the skill's SKILL.md as system instructions and injects skill.yaml metadata into the agent context.
2. **MCP** -- The `run_skill` tool accepts `{ skill: "<name>", path: "<project-root>" }` and performs the same loading via the MCP server.
3. **Slash command routing** -- Commands matching `/harness:*` (e.g., `/harness:brainstorming`) are routed through the orchestrator, which resolves the skill name, validates platform compatibility, and dispatches.

All three paths converge on the same execution engine: the skill's SKILL.md is injected as the agent's instruction set, and phase tracking begins.

## Skill-to-Skill Transitions

Tier 1 skills form a directed chain representing the development lifecycle:

```
brainstorming -> planning -> execution -> verification -> review
```

Each skill declares downstream dependencies in `depends_on`. At the end of a phase, the skill may recommend or automatically trigger the next skill in the chain. Transitions carry forward session state (the `session-slug` argument) so context is preserved across handoffs.

## Recommendation Engine

The `recommend_skills` MCP tool analyzes a project health snapshot and suggests applicable skills:

1. **Health snapshot** -- gathers coverage, lint, architecture, and graph metrics
2. **Rule matching** -- each skill registers conditions (e.g., "coverage below baseline" triggers `harness:tdd`)
3. **Weighted scoring** -- matches are ranked by severity, recency, and tier priority
4. **Output** -- an ordered list of skill names with rationale strings

## Platform Support

Skills declare supported platforms in `skill.yaml`:

| Platform      | Agent Runtime         |
| ------------- | --------------------- |
| `claude-code` | Claude Code CLI / MCP |
| `cursor`      | Cursor IDE agent      |
| `gemini-cli`  | Google Gemini CLI     |
| `codex`       | OpenAI Codex CLI      |

A skill is only dispatched if the current platform appears in its `platforms` list. Platform-specific tool mappings (e.g., Cursor's built-in file tools vs. Claude Code's Read/Write) are handled by the orchestrator's tool adapter layer.
