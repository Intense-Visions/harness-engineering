# Agent Definition Generator for Persona-Based Routing

**Date:** 2026-03-18
**Status:** Approved
**Keywords:** agent-definitions, persona, routing, generate, claude-code, gemini-cli, gsd-executor, slash-commands

## Overview

Harness personas exist but are only reachable via explicit slash commands or MCP invocation. When Claude Code routes natural language instructions like "Address all findings" to agents, GSD wins because its agents are registered in `~/.claude/agents/` while harness has no presence in the agent routing path. This causes harness-managed workflows to fall through to GSD executors that don't use harness methodology.

### Goals

1. Generate platform-specific agent definition files from persona YAMLs so harness personas compete in Claude Code and Gemini CLI agent routing
2. Embed referenced skill SKILL.md content into agent definitions so agents carry the full harness methodology
3. Write task-aware descriptions that claim follow-up action territory (e.g., "fixing review findings" routes to harness-code-reviewer, not gsd-executor)
4. Support project-local and global output paths with project-local taking precedence
5. Create a unified `harness generate` command that runs both slash command and agent definition generation

### Non-Goals

- Removing or replacing GSD agent files (coexistence, not replacement)
- Building a meta-router or agent dispatch interceptor
- Modifying Claude Code's internal routing logic
- Supporting platforms beyond Claude Code and Gemini CLI

## Decisions

| Decision                     | Choice                                                                  | Rationale                                                          |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Source for agent definitions | Personas (with embedded skill content)                                  | Personas are complete workflows; skills are implementation details |
| Command structure            | Separate `generate-agent-definitions` + unified `generate` orchestrator | Clean separation with convenience wrapper                          |
| Output locations             | Project-local default + `--global` flag                                 | Matches slash command pattern; project-local takes precedence      |
| Description strategy         | Task-aware claims covering follow-up actions                            | Wins routing by describing user tasks, not just agent capabilities |
| Platform support             | Claude Code + Gemini CLI from day one                                   | Requirement from user                                              |
| Coexistence with GSD         | Side-by-side, no removal                                                | User may use both frameworks across different projects             |

## Technical Design

### Agent Definition Format (Claude Code)

`~/.claude/agents/harness-code-reviewer.md` or `agents/agents/claude-code/harness-code-reviewer.md`:

```markdown
---
name: harness-code-reviewer
description: >
  Perform code review and address review findings using harness methodology.
  Use when reviewing code, fixing review findings, responding to review feedback,
  or when a code review has produced issues that need to be addressed.
tools: Bash, Read, Glob, Grep
---

## Role

Perform AI-powered code review incorporating harness validation,
architectural analysis, and project-specific calibration.
Produces structured Strengths/Issues/Assessment output.

## Skills

- harness-code-review

## Steps

1. Run `harness validate` (always)
2. Run `harness check-deps` (always)
3. Run `harness check-docs` (on PR)
4. Execute harness-code-review skill (on PR or manual)

## Methodology

[embedded SKILL.md content from harness-code-review]
```

### Agent Definition Format (Gemini CLI)

Agent definitions go to `~/.gemini/agents/` or project-local `agents/agents/gemini-cli/`:

```markdown
---
name: harness-code-reviewer
description: >
  Perform code review and address review findings using harness methodology.
  Use when reviewing code, fixing review findings, responding to review feedback,
  or when a code review has produced issues that need to be addressed.
tools:
  - Bash
  - Read
  - Glob
  - Grep
---

[same body content]
```

### Task-Aware Descriptions Per Persona

| Persona                  | Description                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| code-reviewer            | Perform code review and address review findings using harness methodology. Use when reviewing code, fixing review findings, responding to review feedback, or when a code review has produced issues that need to be addressed.                 |
| task-executor            | Execute implementation plans task-by-task with state tracking, TDD, and verification. Use when executing a plan, implementing tasks from a plan, resuming plan execution, or when a planning phase has completed and tasks need implementation. |
| parallel-coordinator     | Dispatch independent tasks across isolated agents for parallel execution. Use when multiple independent tasks need to run concurrently, splitting work across agents, or coordinating parallel implementation.                                  |
| architecture-enforcer    | Validate architectural constraints and dependency rules. Use when checking layer boundaries, detecting circular dependencies, or verifying import direction compliance.                                                                         |
| documentation-maintainer | Keep documentation in sync with source code. Use when detecting documentation drift, validating doc coverage, or aligning docs with code changes.                                                                                               |
| entropy-cleaner          | Detect and fix codebase entropy including drift, dead code, and pattern violations. Use when running cleanup, detecting dead code, or fixing pattern violations.                                                                                |

### Generator Architecture

New module: `packages/cli/src/agent-definitions/`

```
packages/cli/src/agent-definitions/
  generator.ts          # Core: persona → agent definition
  render-claude-code.ts # Claude Code markdown renderer
  render-gemini-cli.ts  # Gemini CLI markdown renderer
  sync.ts               # Incremental sync (add/update/remove)
```

**`generator.ts`:**

```typescript
export interface AgentDefinition {
  name: string; // harness-<kebab-persona-name>
  description: string; // task-aware description
  tools: string[]; // from persona's skill definitions
  role: string; // from persona.role
  skills: string[]; // persona.skills
  steps: Step[]; // persona.steps
  methodology: string; // embedded SKILL.md content
}

export function generateAgentDefinition(
  persona: Persona,
  skillContents: Map<string, string>,
  descriptions: Map<string, string>
): AgentDefinition;
```

**`render-claude-code.ts`:**

```typescript
export function renderClaudeCodeAgent(def: AgentDefinition): string;
// Returns markdown with YAML frontmatter
```

**`render-gemini-cli.ts`:**

```typescript
export function renderGeminiAgent(def: AgentDefinition): string;
// Returns platform-appropriate format
```

**`sync.ts`:**

```typescript
export interface SyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
}

export function syncAgentDefinitions(
  outputDir: string,
  definitions: AgentDefinition[],
  renderer: (def: AgentDefinition) => string,
  prefix: string // 'harness-'
): SyncResult;
```

### CLI Commands

**`harness generate-agent-definitions`:**

```typescript
new Command('generate-agent-definitions')
  .description('Generate agent definition files from personas')
  .option('--global', 'Write to global agent directory')
  .option('--platform <platform>', 'Target platform (claude-code, gemini-cli, all)', 'all')
  .option('--output-dir <dir>', 'Custom output directory');
```

Output paths:

- Project-local Claude Code: `agents/agents/claude-code/harness-<name>.md`
- Project-local Gemini CLI: `agents/agents/gemini-cli/harness-<name>.md`
- Global Claude Code: `~/.claude/agents/harness-<name>.md`
- Global Gemini CLI: `~/.gemini/agents/harness-<name>.md`

**`harness generate`:**

```typescript
new Command('generate')
  .description('Generate all platform integrations (slash commands + agent definitions)')
  .option('--global', 'Write to global directories')
  .option('--platform <platform>', 'Target platform', 'all');
```

Runs `generate-slash-commands` then `generate-agent-definitions` with the same options.

### MCP Integration

New MCP tool: `generate_agent_definitions`

```typescript
export const generateAgentDefinitionsDefinition = {
  name: 'generate_agent_definitions',
  description: 'Generate agent definition files from personas for Claude Code and Gemini CLI',
  inputSchema: {
    type: 'object',
    properties: {
      global: { type: 'boolean', description: 'Write to global agent directory' },
      platform: { type: 'string', enum: ['claude-code', 'gemini-cli', 'all'] },
    },
  },
};
```

### Skill Content Loading

The generator loads SKILL.md content for each skill referenced by a persona:

```typescript
function loadSkillContent(skillName: string): string | null {
  const skillsDir = resolveSkillsDir();
  const skillMdPath = path.join(skillsDir, skillName, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  return fs.readFileSync(skillMdPath, 'utf-8');
}
```

### File Layout (new/modified)

```
CREATE packages/cli/src/agent-definitions/generator.ts
CREATE packages/cli/src/agent-definitions/render-claude-code.ts
CREATE packages/cli/src/agent-definitions/render-gemini-cli.ts
CREATE packages/cli/src/agent-definitions/sync.ts
CREATE packages/cli/src/commands/generate-agent-definitions.ts
CREATE packages/cli/src/commands/generate.ts
MODIFY packages/cli/src/index.ts
MODIFY packages/mcp-server/src/server.ts
CREATE packages/mcp-server/src/tools/agent-definitions.ts
CREATE packages/cli/tests/agent-definitions/generator.test.ts
CREATE packages/cli/tests/agent-definitions/render-claude-code.test.ts
CREATE packages/cli/tests/agent-definitions/render-gemini-cli.test.ts
CREATE packages/cli/tests/agent-definitions/sync.test.ts
CREATE packages/cli/tests/commands/generate-agent-definitions.test.ts
CREATE packages/cli/tests/commands/generate.test.ts
```

## Success Criteria

1. **Agent definitions generate from personas** — `harness generate-agent-definitions` produces one agent `.md` file per persona for each target platform
2. **Claude Code format correct** — generated files have YAML frontmatter with `name`, `description`, `tools` and markdown body with role, steps, and embedded SKILL.md methodology
3. **Gemini CLI format correct** — generated files match Gemini CLI's agent registration format
4. **Task-aware descriptions** — each agent's description explicitly claims follow-up action territory
5. **Skill content embedded** — each agent definition includes the full SKILL.md content from referenced skills
6. **Project-local output works** — default output writes to `agents/agents/claude-code/` and `agents/agents/gemini-cli/`
7. **Global output works** — `--global` writes to `~/.claude/agents/` and `~/.gemini/agents/`
8. **Incremental sync** — re-running the generator updates changed files, removes stale ones, and leaves unchanged ones untouched
9. **`harness generate` orchestrates both** — runs `generate-slash-commands` and `generate-agent-definitions` in sequence
10. **MCP tool available** — `generate_agent_definitions` MCP tool works for programmatic invocation
11. **Harness agents prefix** — all generated agent files are prefixed `harness-` to avoid name collisions
12. **Backward compatible** — existing slash command generation unchanged
13. **All existing tests pass** — 357+ CLI tests with no regressions

## Implementation Order

1. **Generator core** — `generator.ts` with `generateAgentDefinition()` that transforms persona + skill content into `AgentDefinition`. Add tests.
2. **Claude Code renderer** — `render-claude-code.ts` producing markdown with YAML frontmatter. Add tests.
3. **Gemini CLI renderer** — `render-gemini-cli.ts` producing platform-appropriate format. Add tests.
4. **Sync module** — `sync.ts` with incremental add/update/remove logic. Add tests.
5. **CLI command: generate-agent-definitions** — wire up discovery, generation, rendering, and sync. Add tests.
6. **CLI command: generate** — orchestrator running both generators. Add tests.
7. **Register commands in CLI** — add both commands to `index.ts` program.
8. **MCP tool** — `generate_agent_definitions` tool in MCP server.
9. **Export updates** — export new types and functions from CLI package.
