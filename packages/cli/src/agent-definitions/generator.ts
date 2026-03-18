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
};

const DEFAULT_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'];

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
    tools: DEFAULT_TOOLS,
    role: persona.role,
    skills: persona.skills,
    steps: persona.steps,
    methodology: methodologyParts.join('\n\n---\n\n'),
  };
}
