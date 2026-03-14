import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { TemplateEngine } from '../templates/engine';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { resolveTemplatesDir } from '../utils/paths';

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
    return Err(new CLIError(
      'Project already initialized. Use --force to overwrite.',
      ExitCode.ERROR
    ));
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
    framework: options.framework,
  });
  if (!renderResult.ok) {
    return Err(new CLIError(renderResult.error.message, ExitCode.ERROR));
  }

  const writeResult = engine.write(renderResult.value, cwd, { overwrite: force });
  if (!writeResult.ok) {
    return Err(new CLIError(writeResult.error.message, ExitCode.ERROR));
  }

  return Ok({ filesCreated: writeResult.value });
}

export function createInitCommand(): Command {
  const command = new Command('init')
    .description('Initialize a new harness-engineering project')
    .option('-n, --name <name>', 'Project name')
    .option('-l, --level <level>', 'Adoption level (basic, intermediate, advanced)', 'basic')
    .option('--framework <framework>', 'Framework overlay (nextjs)')
    .option('-f, --force', 'Overwrite existing files')
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

      if (!globalOpts.quiet) {
        logger.success('Project initialized!');
        logger.info('Created files:');
        for (const file of result.value.filesCreated) {
          console.log(`  - ${file}`);
        }
        console.log('\nNext steps:');
        console.log('  1. Review harness.config.json');
        console.log('  2. Update AGENTS.md with your project structure');
        console.log('  3. Run "harness validate" to check your setup');
      }

      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
