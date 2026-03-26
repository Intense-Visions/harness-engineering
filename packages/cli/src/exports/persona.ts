/**
 * Persona and agent orchestration.
 */
export { loadPersona, listPersonas } from '../persona/loader';
export type { PersonaMetadata } from '../persona/loader';
export { generateRuntime } from '../persona/generators/runtime';
export { generateAgentsMd } from '../persona/generators/agents-md';
export { generateCIWorkflow } from '../persona/generators/ci-workflow';
export { runPersona } from '../persona/runner';
export type {
  CommandExecutor,
  SkillExecutor,
  StepExecutionContext,
  PersonaRunReport,
  StepReport,
} from '../persona/runner';
export { executeSkill } from '../persona/skill-executor';
export type { SkillExecutionContext, SkillExecutionResult } from '../persona/skill-executor';
export type { Persona, Step, CommandStep, SkillStep, TriggerContext } from '../persona/schema';
export { ALLOWED_PERSONA_COMMANDS } from '../persona/constants';
export { detectTrigger } from '../persona/trigger-detector';
export type { HandoffContext, TriggerDetectionResult } from '../persona/trigger-detector';

/**
 * Agent definition generators.
 */
export { generateAgentDefinitions } from '../commands/generate-agent-definitions';
export type {
  GenerateAgentDefsOptions,
  GenerateAgentDefsResult,
} from '../commands/generate-agent-definitions';
export {
  generateAgentDefinition,
  AGENT_DESCRIPTIONS,
  DEFAULT_TOOLS,
  GEMINI_TOOL_MAP,
} from '../agent-definitions/generator';
export type { AgentDefinition } from '../agent-definitions/generator';
export { renderClaudeCodeAgent } from '../agent-definitions/render-claude-code';
export { renderGeminiAgent } from '../agent-definitions/render-gemini-cli';
