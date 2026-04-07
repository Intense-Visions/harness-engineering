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
import { commandCreators } from './commands/_registry';

/**
 * Creates and configures the main Harness CLI program.
 *
 * Commands are auto-discovered from the commands/ directory via _registry.ts.
 * To add a new command: create it in commands/, export a createXXXCommand()
 * function, then run `pnpm run generate-barrel-exports` to regenerate the registry.
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

  // Register all discovered commands
  for (const creator of commandCreators) {
    program.addCommand(creator());
  }

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
