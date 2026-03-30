/**
 * @harness-engineering/cli
 *
 * Command-line interface for the Harness Engineering toolkit.
 *
 * This package provides a unified `harness` command with subcommands for
 * validation, documentation management, dependency checking, and agent
 * orchestration.
 */

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
import { createSetupCommand } from './commands/setup';
import { createDoctorCommand } from './commands/doctor';
import { createGenerateSlashCommandsCommand } from './commands/generate-slash-commands';
import { createCICommand } from './commands/ci';
import { createHooksCommand } from './commands/hooks';
import { createUpdateCommand } from './commands/update';
import { createGenerateAgentDefinitionsCommand } from './commands/generate-agent-definitions';
import { createGenerateCommand } from './commands/generate';
import { createScanCommand } from './commands/graph/scan';
import { createIngestCommand } from './commands/graph/ingest';
import { createQueryCommand } from './commands/graph/query';
import { createGraphCommand } from './commands/graph/index';
import { createMcpCommand } from './commands/mcp';
import { createImpactPreviewCommand } from './commands/impact-preview';
import { createCheckArchCommand } from './commands/check-arch';
import { createBlueprintCommand } from './commands/blueprint';
import { createShareCommand } from './commands/share';
import { createInstallCommand } from './commands/install';
import { createInstallConstraintsCommand } from './commands/install-constraints';
import { createUninstallConstraintsCommand } from './commands/uninstall-constraints';
import { createUninstallCommand } from './commands/uninstall';
import { createOrchestratorCommand } from './commands/orchestrator';
import { createLearningsCommand } from './commands/learnings';

/**
 * Creates and configures the main Harness CLI program.
 *
 * @returns A Commander instance with all subcommands registered.
 */
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
  program.addCommand(createLearningsCommand());
  program.addCommand(createCheckPhaseGateCommand());
  program.addCommand(createCreateSkillCommand());
  program.addCommand(createSetupMcpCommand());
  program.addCommand(createSetupCommand());
  program.addCommand(createDoctorCommand());
  program.addCommand(createGenerateSlashCommandsCommand());
  program.addCommand(createGenerateAgentDefinitionsCommand());
  program.addCommand(createGenerateCommand());
  program.addCommand(createCICommand());
  program.addCommand(createHooksCommand());
  program.addCommand(createUpdateCommand());
  program.addCommand(createScanCommand());
  program.addCommand(createIngestCommand());
  program.addCommand(createQueryCommand());
  program.addCommand(createGraphCommand());
  program.addCommand(createMcpCommand());
  program.addCommand(createImpactPreviewCommand());
  program.addCommand(createCheckArchCommand());
  program.addCommand(createBlueprintCommand());
  program.addCommand(createShareCommand());
  program.addCommand(createInstallCommand());
  program.addCommand(createInstallConstraintsCommand());
  program.addCommand(createUninstallConstraintsCommand());
  program.addCommand(createUninstallCommand());
  program.addCommand(createOrchestratorCommand());

  return program;
}

/**
 * Preamble builder for skill generation.
 */
export { buildPreamble } from './commands/skill/preamble';

/**
 * Graph operations (scan, query, ingest, status, export).
 */
export * from './exports/graph';

/**
 * Core command implementations (validation, generation, impact, architecture).
 */
export * from './exports/commands';

/**
 * Error handling and logging utilities.
 */
export { CLIError, ExitCode, handleError } from './utils/errors';
/**
 * Formatting and output mode types.
 */
export { OutputFormatter, OutputMode } from './output/formatter';
/**
 * Global CLI logger.
 */
export { logger } from './output/logger';
/**
 * Configuration loading and resolution.
 */
export { loadConfig, findConfigFile, resolveConfig } from './config/loader';
export type { HarnessConfig } from './config/schema';

/**
 * Template engine for file generation.
 */
export { TemplateEngine } from './templates/engine';
export type { TemplateContext, RenderedFiles } from './templates/engine';

/**
 * Persona, agent orchestration, and agent definition generators.
 */
export * from './exports/persona';

/**
 * MCP server factory and tool definitions.
 */
export { createHarnessServer, startServer, getToolDefinitions } from './mcp/index';

/**
 * Skill installation and management (install, uninstall, constraints).
 */
export * from './exports/registry';
