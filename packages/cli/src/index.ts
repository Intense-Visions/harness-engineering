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

  return program;
}

// Re-export utilities
export { CLIError, ExitCode, handleError } from './utils/errors';
export { OutputFormatter, OutputMode } from './output/formatter';
export { logger } from './output/logger';
export { loadConfig, findConfigFile, resolveConfig } from './config/loader';
export type { HarnessConfig } from './config/schema';
