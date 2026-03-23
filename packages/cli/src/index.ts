import { Command } from 'commander';
import { CLI_VERSION } from './version';
import { createValidateCommand } from './commands/validate';
import { createCheckDepsCommand } from './commands/check-deps';
import { createCheckPerfCommand } from './commands/check-perf';
import { createCheckSecurityCommand } from './commands/check-security';
import { createPerfCommand } from './commands/perf';
import { createCheckDocsCommand } from './commands/check-docs';
import { createInitCommand } from './commands/init';
import { createCleanupCommand } from './commands/cleanup';
import { createFixDriftCommand } from './commands/fix-drift';
import { createAgentCommand } from './commands/agent';
import { createAddCommand } from './commands/add';
import { createLinterCommand } from './commands/linter';
import { createPersonaCommand } from './commands/persona';
import { createSkillCommand } from './commands/skill';
import { createStateCommand } from './commands/state';
import { createCheckPhaseGateCommand } from './commands/check-phase-gate';
import { createCreateSkillCommand } from './commands/create-skill';
import { createSetupMcpCommand } from './commands/setup-mcp';
import { createGenerateSlashCommandsCommand } from './commands/generate-slash-commands';
import { createCICommand } from './commands/ci';
import { createUpdateCommand } from './commands/update';
import { createGenerateAgentDefinitionsCommand } from './commands/generate-agent-definitions';
import { createGenerateCommand } from './commands/generate';
import { createScanCommand } from './commands/graph/scan';
import { createIngestCommand } from './commands/graph/ingest';
import { createQueryCommand } from './commands/graph/query';
import { createGraphCommand } from './commands/graph/index';
import { createMcpCommand } from './commands/mcp';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('harness')
    .description('CLI for Harness Engineering toolkit')
    .version(CLI_VERSION)
    .option('-c, --config <path>', 'Path to config file')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Verbose output')
    .option('--quiet', 'Minimal output');

  // Register commands
  program.addCommand(createValidateCommand());
  program.addCommand(createCheckDepsCommand());
  program.addCommand(createCheckDocsCommand());
  program.addCommand(createCheckPerfCommand());
  program.addCommand(createCheckSecurityCommand());
  program.addCommand(createPerfCommand());
  program.addCommand(createInitCommand());
  program.addCommand(createCleanupCommand());
  program.addCommand(createFixDriftCommand());
  program.addCommand(createAgentCommand());
  program.addCommand(createAddCommand());
  program.addCommand(createLinterCommand());
  program.addCommand(createPersonaCommand());
  program.addCommand(createSkillCommand());
  program.addCommand(createStateCommand());
  program.addCommand(createCheckPhaseGateCommand());
  program.addCommand(createCreateSkillCommand());
  program.addCommand(createSetupMcpCommand());
  program.addCommand(createGenerateSlashCommandsCommand());
  program.addCommand(createGenerateAgentDefinitionsCommand());
  program.addCommand(createGenerateCommand());
  program.addCommand(createCICommand());
  program.addCommand(createUpdateCommand());
  program.addCommand(createScanCommand());
  program.addCommand(createIngestCommand());
  program.addCommand(createQueryCommand());
  program.addCommand(createGraphCommand());
  program.addCommand(createMcpCommand());

  return program;
}

// Preamble builder export
export { buildPreamble } from './commands/skill/preamble';

// Command function exports (used by MCP server)
export { runScan } from './commands/graph/scan';
export { runQuery } from './commands/graph/query';
export { runIngest } from './commands/graph/ingest';
export { runGraphStatus } from './commands/graph/status';
export { runGraphExport } from './commands/graph/export';
export { runCheckPhaseGate } from './commands/check-phase-gate';
export { runCrossCheck } from './commands/validate-cross-check';
export { generateSkillFiles } from './commands/create-skill';
export type { CreateSkillOptions } from './commands/create-skill';
export { generateSlashCommands } from './commands/generate-slash-commands';
export type { GenerateResult } from './commands/generate-slash-commands';
export type { SkillSource } from './slash-commands/normalize';

// Re-export utilities
export { CLIError, ExitCode, handleError } from './utils/errors';
export { OutputFormatter, OutputMode } from './output/formatter';
export { logger } from './output/logger';
export { loadConfig, findConfigFile, resolveConfig } from './config/loader';
export type { HarnessConfig } from './config/schema';

// Template engine exports
export { TemplateEngine } from './templates/engine';
export type { TemplateContext, RenderedFiles } from './templates/engine';

// Persona exports
export { loadPersona, listPersonas } from './persona/loader';
export type { PersonaMetadata } from './persona/loader';
export { generateRuntime } from './persona/generators/runtime';
export { generateAgentsMd } from './persona/generators/agents-md';
export { generateCIWorkflow } from './persona/generators/ci-workflow';
export { runPersona } from './persona/runner';
export type {
  CommandExecutor,
  SkillExecutor,
  StepExecutionContext,
  PersonaRunReport,
  StepReport,
} from './persona/runner';
export { executeSkill } from './persona/skill-executor';
export type { SkillExecutionContext, SkillExecutionResult } from './persona/skill-executor';
export type { Persona, Step, CommandStep, SkillStep, TriggerContext } from './persona/schema';
export { ALLOWED_PERSONA_COMMANDS } from './persona/constants';
export { detectTrigger } from './persona/trigger-detector';
export type { HandoffContext, TriggerDetectionResult } from './persona/trigger-detector';

// Agent definition exports
export { generateAgentDefinitions } from './commands/generate-agent-definitions';
export type {
  GenerateAgentDefsOptions,
  GenerateAgentDefsResult,
} from './commands/generate-agent-definitions';
export {
  generateAgentDefinition,
  AGENT_DESCRIPTIONS,
  DEFAULT_TOOLS,
  GEMINI_TOOL_MAP,
} from './agent-definitions/generator';
export type { AgentDefinition } from './agent-definitions/generator';
export { renderClaudeCodeAgent } from './agent-definitions/render-claude-code';
export { renderGeminiAgent } from './agent-definitions/render-gemini-cli';

// MCP server exports
export { createHarnessServer, startServer, getToolDefinitions } from './mcp/index';
