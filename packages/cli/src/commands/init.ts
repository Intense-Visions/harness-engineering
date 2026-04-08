import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { TemplateEngine, type DetectedFramework } from '../templates/engine';
import type { TemplateMetadata } from '../templates/schema';
import { persistToolingConfig, appendFrameworkAgents } from '../templates/post-write';
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
  detectedFrameworks?: DetectedFramework[];
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

  const engine = new TemplateEngine(resolveTemplatesDir());
  const templates = engine.listTemplates();
  const templateList = templates.ok ? templates.value : [];

  const validationError = validateFrameworkLanguage(options, templateList);
  if (validationError) return Err(validationError);

  const detected = tryAutoDetect(engine, cwd, options);
  if (detected) return Ok(detected);

  const language = resolveLanguage(options, templateList);
  return scaffoldProject(engine, { cwd, name, force, language, options });
}

function validateFrameworkLanguage(
  options: InitOptions,
  templateList: TemplateMetadata[]
): CLIError | null {
  if (!options.framework || !options.language) return null;
  const fwTemplate = templateList.find((t) => t.framework === options.framework);
  if (fwTemplate?.language && fwTemplate.language !== options.language) {
    return new CLIError(
      `Framework "${options.framework}" is a ${fwTemplate.language} framework, but --language ${options.language} was specified. Remove --language or use --language ${fwTemplate.language}.`,
      ExitCode.ERROR
    );
  }
  return null;
}

function tryAutoDetect(
  engine: TemplateEngine,
  cwd: string,
  options: InitOptions
): InitResult | null {
  if (options.framework || options.language) return null;
  const detectResult = engine.detectFramework(cwd);
  if (detectResult.ok && detectResult.value.length > 0) {
    return { filesCreated: [], skippedConfigs: [], detectedFrameworks: detectResult.value };
  }
  return null;
}

function resolveLanguage(
  options: InitOptions,
  templateList: TemplateMetadata[]
): string | undefined {
  if (options.language) return options.language;
  if (options.framework) {
    const fwTemplate = templateList.find((t) => t.framework === options.framework);
    if (fwTemplate?.language) return fwTemplate.language;
  }
  return undefined;
}

function scaffoldProject(
  engine: TemplateEngine,
  ctx: {
    cwd: string;
    name: string;
    force: boolean;
    language: string | undefined;
    options: InitOptions;
  }
): Result<InitResult, CLIError> {
  const { cwd, name, force, language, options } = ctx;
  const isNonJs = language && language !== 'typescript';
  const level = isNonJs ? undefined : (options.level ?? 'basic');

  const resolveResult = engine.resolveTemplate(level, options.framework, language);
  if (!resolveResult.ok) return Err(new CLIError(resolveResult.error.message, ExitCode.ERROR));

  const renderResult = engine.render(resolveResult.value, {
    projectName: name,
    level: level ?? '',
    ...(options.framework !== undefined && { framework: options.framework }),
    ...(language !== undefined && { language }),
  });
  if (!renderResult.ok) return Err(new CLIError(renderResult.error.message, ExitCode.ERROR));

  const writeResult = engine.write(renderResult.value, cwd, {
    overwrite: force,
    ...(language !== undefined && { language }),
  });
  if (!writeResult.ok) return Err(new CLIError(writeResult.error.message, ExitCode.ERROR));

  if (writeResult.value.skippedConfigs.length > 0) {
    logger.warn('Skipped existing package config files:');
    for (const file of writeResult.value.skippedConfigs) {
      logger.info(`  - ${file} (add harness dependencies manually)`);
    }
  }

  persistToolingConfig(cwd, resolveResult.value, options.framework);
  appendFrameworkAgents(cwd, options.framework, language);

  return Ok({
    filesCreated: writeResult.value.written,
    skippedConfigs: writeResult.value.skippedConfigs,
  });
}

function printInitSuccess(filesCreated: string[], mcpConfigured: string[]): void {
  console.log('');
  logger.success('Project initialized!');
  console.log('');
  logger.info('Created files:');
  for (const file of filesCreated) {
    console.log(`  ${chalk.green('+')} ${file}`);
  }
  if (mcpConfigured.length > 0) {
    console.log('');
    logger.info('MCP server configured for:');
    for (const name of mcpConfigured) {
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

async function runInitAction(opts: InitOptions & { quiet?: boolean }): Promise<void> {
  const result = await runInit(opts);

  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(result.error.exitCode);
  }

  const cwd = opts.cwd ?? process.cwd();
  const mcpResult = setupMcp(cwd, 'all');

  if (!opts.quiet) {
    printInitSuccess(result.value.filesCreated, mcpResult.configured);
  }

  process.exit(ExitCode.SUCCESS);
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
      await runInitAction({
        name: opts.name,
        level: opts.level,
        framework: opts.framework,
        language: opts.language,
        force: opts.force,
        quiet: globalOpts.quiet,
      });
    });

  return command;
}
