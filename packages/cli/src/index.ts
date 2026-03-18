import { Command } from 'commander';
import { VERSION } from '@harness-engineering/core';
import { createValidateCommand } from './commands/validate';
import { createCheckDepsCommand } from './commands/check-deps';
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

export function createProgram(): Command {
  const program = new Command();

  program
    .name('harness')
    .description('CLI for Harness Engineering toolkit')
    .version(VERSION)
    .option('-c, --config <path>', 'Path to config file')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Verbose output')
    .option('--quiet', 'Minimal output');

  // Register commands
  program.addCommand(createValidateCommand());
  program.addCommand(createCheckDepsCommand());
  program.addCommand(createCheckDocsCommand());
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
  program.addCommand(createCICommand());
  program.addCommand(createUpdateCommand());

  return program;
}

// Preamble builder export
export { buildPreamble } from './commands/skill/preamble';

// Command function exports (used by MCP server)
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
