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
  language?: string;
  force?: boolean;
}

interface InitResult {
  filesCreated: string[];
  skippedConfigs: string[];
}

export async function runInit(options: InitOptions): Promise<Result<InitResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const name = options.name ?? path.basename(cwd);
  const force = options.force ?? false;

  const configPath = path.join(cwd, 'harness.config.json');

  if (!force && fs.existsSync(configPath)) {
    return Err(
      new CLIError('Project already initialized. Use --force to overwrite.', ExitCode.ERROR)
    );
  }

  const templatesDir = resolveTemplatesDir();
  const engine = new TemplateEngine(templatesDir);

  // Load template list once for conflict validation and language inference
  const templates = engine.listTemplates();
  const templateList = templates.ok ? templates.value : [];

  // Validate --framework / --language conflict
  if (options.framework && options.language) {
    const fwTemplate = templateList.find((t) => t.framework === options.framework);
    if (fwTemplate?.language && fwTemplate.language !== options.language) {
      return Err(
        new CLIError(
          `Framework "${options.framework}" is a ${fwTemplate.language} framework, but --language ${options.language} was specified. Remove --language or use --language ${fwTemplate.language}.`,
          ExitCode.ERROR
        )
      );
    }
  }

  // Determine language: explicit, inferred from framework, or default typescript
  let language = options.language;
  if (!language && options.framework) {
    const fwTemplate = templateList.find((t) => t.framework === options.framework);
    if (fwTemplate?.language) language = fwTemplate.language;
  }

  // Level is required for JS/TS, optional for other languages
  const isNonJs = language && language !== 'typescript';
  const level = isNonJs ? undefined : (options.level ?? 'basic');

  const resolveResult = engine.resolveTemplate(level, options.framework, language);
  if (!resolveResult.ok) {
    return Err(new CLIError(resolveResult.error.message, ExitCode.ERROR));
  }

  const renderResult = engine.render(resolveResult.value, {
    projectName: name,
    level: level ?? '',
    ...(options.framework !== undefined && { framework: options.framework }),
    ...(language !== undefined && { language }),
  });
  if (!renderResult.ok) {
    return Err(new CLIError(renderResult.error.message, ExitCode.ERROR));
  }

  const writeResult = engine.write(renderResult.value, cwd, {
    overwrite: force,
    ...(language !== undefined && { language }),
  });
  if (!writeResult.ok) {
    return Err(new CLIError(writeResult.error.message, ExitCode.ERROR));
  }

  // Log skipped config files
  if (writeResult.value.skippedConfigs.length > 0) {
    logger.warn('Skipped existing package config files:');
    for (const file of writeResult.value.skippedConfigs) {
      logger.info(`  - ${file} (add harness dependencies manually)`);
    }
  }

  return Ok({
    filesCreated: writeResult.value.written,
    skippedConfigs: writeResult.value.skippedConfigs,
  });
}

export function createInitCommand(): Command {
  const command = new Command('init')
    .description('Initialize a new harness-engineering project')
    .option('-n, --name <name>', 'Project name')
    .option('-l, --level <level>', 'Adoption level (basic, intermediate, advanced)', 'basic')
    .option('--framework <framework>', 'Framework overlay (nextjs)')
    .option('--language <language>', 'Target language (typescript, python, go, rust, java)')
    .option('-f, --force', 'Overwrite existing files')
    .option('-y, --yes', 'Use defaults without prompting')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      const result = await runInit({
        name: opts.name,
        level: opts.level,
        framework: opts.framework,
        language: opts.language,
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
