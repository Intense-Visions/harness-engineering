import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { TemplateEngine } from '../templates/engine';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { resolveTemplatesDir } from '../utils/paths';
import { setupMcp } from './setup-mcp';

interface InitOptions {
  cwd?: string;
  name?: string;
  level?: string;
  framework?: string;
  force?: boolean;
}

interface InitResult {
  filesCreated: string[];
}

export async function runInit(options: InitOptions): Promise<Result<InitResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const name = options.name ?? path.basename(cwd);
  const level = options.level ?? 'basic';
  const force = options.force ?? false;

  const configPath = path.join(cwd, 'harness.config.json');

  if (!force && fs.existsSync(configPath)) {
    return Err(
      new CLIError('Project already initialized. Use --force to overwrite.', ExitCode.ERROR)
    );
  }

  const templatesDir = resolveTemplatesDir();
  const engine = new TemplateEngine(templatesDir);

  const resolveResult = engine.resolveTemplate(level, options.framework);
  if (!resolveResult.ok) {
    return Err(new CLIError(resolveResult.error.message, ExitCode.ERROR));
  }

  const renderResult = engine.render(resolveResult.value, {
    projectName: name,
    level,
    ...(options.framework !== undefined && { framework: options.framework }),
  });
  if (!renderResult.ok) {
    return Err(new CLIError(renderResult.error.message, ExitCode.ERROR));
  }

  const writeResult = engine.write(renderResult.value, cwd, { overwrite: force });
  if (!writeResult.ok) {
    return Err(new CLIError(writeResult.error.message, ExitCode.ERROR));
  }

  return Ok({ filesCreated: writeResult.value.written });
}

export function createInitCommand(): Command {
  const command = new Command('init')
    .description('Initialize a new harness-engineering project')
    .option('-n, --name <name>', 'Project name')
    .option('-l, --level <level>', 'Adoption level (basic, intermediate, advanced)', 'basic')
    .option('--framework <framework>', 'Framework overlay (nextjs)')
    .option('-f, --force', 'Overwrite existing files')
    .option('-y, --yes', 'Use defaults without prompting')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      const result = await runInit({
        name: opts.name,
        level: opts.level,
        framework: opts.framework,
        force: opts.force,
      });

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      // Set up MCP server config for AI clients
      const cwd = opts.cwd ?? process.cwd();
      const mcpResult = setupMcp(cwd, 'all');

      if (!globalOpts.quiet) {
        console.log('');
        logger.success('Project initialized!');
        console.log('');
        logger.info('Created files:');
        for (const file of result.value.filesCreated) {
          console.log(`  ${chalk.green('+')} ${file}`);
        }
        if (mcpResult.configured.length > 0) {
          console.log('');
          logger.info('MCP server configured for:');
          for (const name of mcpResult.configured) {
            console.log(`  ${chalk.green('+')} ${name}`);
          }
        }
        console.log('');
        console.log(chalk.bold('Next steps:'));
        console.log(`  1. Review ${chalk.cyan('harness.config.json')}`);
        console.log(`  2. Update ${chalk.cyan('AGENTS.md')} with your project context`);
        console.log(`  3. Run ${chalk.cyan('harness validate')} to check your setup`);
        console.log('');
      }

      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
