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
