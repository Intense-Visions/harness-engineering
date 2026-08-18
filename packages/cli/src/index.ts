/**
 * @harness-engineering/cli
 *
 * Command-line interface for the Harness Engineering toolkit.
 *
 * This package provides a unified `harness` command with subcommands for
 * validation, documentation management, dependency checking, and agent
 * orchestration.
 */

import { writeSync } from 'node:fs';
import { Command } from 'commander';
import { CLI_VERSION } from './version';
import { commandCreators } from './commands/_registry';
import { registerDeprecatedGraphAliases } from './commands/graph/deprecated-aliases';
import { installVersionGuard } from './utils/version-guard';

/**
 * Creates and configures the main Harness CLI program.
 *
 * Commands are auto-discovered from the commands/ directory via _registry.ts.
 * To add a new command: create it in commands/, export a createXXXCommand()
 * function, then run `pnpm run generate-barrel-exports` to regenerate the registry.
 *
 * @returns A Commander instance with all subcommands registered.
 */
/**
 * Write synchronously to a file descriptor so the bytes land before a
 * subsequent process.exit(), falling back to the stream when the fd is
 * unavailable (EPIPE from a closed downstream reader, or a non-fd stdout such
 * as a captured stream in tests).
 */
function writeSyncOrFallback(fd: number, str: string, stream: NodeJS.WriteStream): void {
  const buf = Buffer.from(str, 'utf-8');
  let offset = 0;
  try {
    // writeSync on a NON-BLOCKING pipe returns a short count instead of
    // throwing, so a single call silently drops everything past the first
    // chunk (~8KB). Loop until the buffer is drained; retry EAGAIN, which the
    // fd reports when the reader has not yet consumed the previous chunk.
    while (offset < buf.length) {
      try {
        offset += writeSync(fd, buf, offset, buf.length - offset);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EAGAIN') continue;
        throw error;
      }
    }
  } catch {
    // fd unusable (EPIPE from a closed downstream reader, or a non-fd stdout):
    // fall back to the stream for whatever has not been written yet.
    stream.write(buf.subarray(offset).toString('utf-8'));
  }
}

export function createProgram(): Command {
  const program = new Command();

  // Commander writes help/version with process.stdout.write and then exits.
  // Writes to a PIPE are asynchronous, so process.exit() discards whatever is
  // still buffered — `harness --help` truncated mid-word at ~8KB whenever its
  // output was piped or captured (visible on macOS, where the pipe drains in
  // smaller chunks than on Linux CI). Writing synchronously to the fd makes the
  // output immune to the exit race. Falls back to the stream if the fd write
  // fails (fd closed, EPIPE from a downstream `head`, non-fd stdout).
  program.configureOutput({
    writeOut: (str) => writeSyncOrFallback(1, str, process.stdout),
    writeErr: (str) => writeSyncOrFallback(2, str, process.stderr),
  });

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

  // Legacy top-level scan/query/ingest, kept as hidden deprecated aliases of
  // the canonical `harness graph <op>` commands (see #644).
  registerDeprecatedGraphAliases(program);

  // Refuse to emit findings when this CLI is sharply out of step with the
  // workspace it is scanning. Installed here rather than in bin/harness.ts so
  // every consumer of createProgram() gets a guarded program.
  installVersionGuard(program, process.cwd());

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
