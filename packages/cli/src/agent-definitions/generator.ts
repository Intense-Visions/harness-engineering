import type { Persona, Step } from '../persona/schema';
import { toKebabCase } from '../utils/string';

export interface AgentDefinition {
  name: string;
  description: string;
  tools: string[];
  role: string;
  skills: string[];
  steps: Step[];
  methodology: string;
}

export const AGENT_DESCRIPTIONS: Record<string, string> = {
  'code-reviewer':
    'Perform code review and address review findings using harness methodology. Use when reviewing code, fixing review findings, responding to review feedback, or when a code review has produced issues that need to be addressed.',
  'task-executor':
    'Execute implementation plans task-by-task with state tracking, TDD, and verification. Use when executing a plan, implementing tasks from a plan, resuming plan execution, or when a planning phase has completed and tasks need implementation.',
  'parallel-coordinator':
    'Dispatch independent tasks across isolated agents for parallel execution. Use when multiple independent tasks need to run concurrently, splitting work across agents, or coordinating parallel implementation.',
  'architecture-enforcer':
    'Validate architectural constraints and dependency rules. Use when checking layer boundaries, detecting circular dependencies, or verifying import direction compliance.',
  'documentation-maintainer':
    'Keep documentation in sync with source code. Use when detecting documentation drift, validating doc coverage, or aligning docs with code changes.',
  'entropy-cleaner':
    'Detect and fix codebase entropy including drift, dead code, and pattern violations. Use when running cleanup, detecting dead code, or fixing pattern violations.',
  planner:
    'Create detailed implementation plans from specs with task breakdown, dependency ordering, and checkpoint placement. Use when planning a phase, breaking a spec into tasks, or creating an execution plan.',
  verifier:
    'Verify implementation completeness against spec and plan at three tiers (EXISTS, SUBSTANTIVE, WIRED). Use when checking if built code matches what was planned, validating phase completion, or auditing implementation quality.',
};

export const DEFAULT_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'] as const;

/**
 * Harness MCP tools a Claude Code persona subagent needs to follow the Pause
 * Protocol: read the resolved autonomy level (`gather_context`, `manage_state`)
 * and log an auto-resolved ceremony pause (`record_auto_decision`).
 * `emit_interaction` is listed for the skills' non-escalation interactions; the
 * protocol forbids it for escalations. Without these, a subagent's `tools:`
 * allowlist refuses every MCP call and every pause inside it falls back to
 * autopilot. A persona still cannot spawn the blind auditor, so it hands
 * judgment forks back rather than taking them (Pause Protocol, "Handing a fork
 * back").
 *
 * Named exactly rather than as `mcp__harness__*`: the subagent `tools` field
 * documents exact names, and the list stays the least the protocol needs. It
 * does widen one capability: a persona can now write the decision log, which
 * the `autonomy-guard` hook keeps closed to Bash and Write. Audit statuses in
 * that log were already agent-reported. None of these tools can raise autonomy
 * (`set-autonomy` only lowers). Both server spellings are listed: `harness`
 * from `harness setup-mcp`, and the `harness-claude` plugin's server. A name
 * that matches no connected server is never offered.
 */
export const PAUSE_PROTOCOL_MCP_TOOLS = [
  'gather_context',
  'manage_state',
  'record_auto_decision',
  'emit_interaction',
] as const;

export const CLAUDE_CODE_MCP_SERVER_PREFIXES = [
  'mcp__harness__',
  'mcp__plugin_harness-claude_harness__',
] as const;

export function claudeCodeMcpTools(): string[] {
  return CLAUDE_CODE_MCP_SERVER_PREFIXES.flatMap((prefix) =>
    PAUSE_PROTOCOL_MCP_TOOLS.map((tool) => `${prefix}${tool}`)
  );
}

/**
 * Map Claude Code tool names to Gemini CLI tool names.
 * Gemini CLI validates tool names and rejects unknown ones.
 *
 * Co-located with DEFAULT_TOOLS so adding a new default tool
 * is a clear prompt to add its Gemini equivalent here.
 */
export const GEMINI_TOOL_MAP: Record<string, string> = {
  Bash: 'run_shell_command',
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'replace',
  Glob: 'glob',
  Grep: 'search_file_content',
};

export function generateAgentDefinition(
  persona: Persona,
  skillContents: Map<string, string>
): AgentDefinition {
  const kebabName = toKebabCase(persona.name);
  const name = `harness-${kebabName}`;
  const description = AGENT_DESCRIPTIONS[kebabName] ?? persona.description;

  const methodologyParts: string[] = [];
  for (const skillName of persona.skills) {
    const content = skillContents.get(skillName);
    if (content) {
      methodologyParts.push(content);
    }
  }

  return {
    name,
    description,
    tools: [...DEFAULT_TOOLS],
    role: persona.role,
    skills: persona.skills,
    steps: persona.steps,
    methodology: methodologyParts.join('\n\n---\n\n'),
  };
}
