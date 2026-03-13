import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { CONFIG_TEMPLATE, AGENTS_MD_TEMPLATE, DOCS_INDEX_TEMPLATE } from '../templates/basic';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

interface InitOptions {
  cwd?: string;
  name?: string;
  force?: boolean;
}

interface InitResult {
  filesCreated: string[];
}

export async function runInit(options: InitOptions): Promise<Result<InitResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const name = options.name ?? path.basename(cwd);
  const force = options.force ?? false;

  const configPath = path.join(cwd, 'harness.config.json');
  const agentsPath = path.join(cwd, 'AGENTS.md');
  const docsDir = path.join(cwd, 'docs');

  // Check if already initialized
  if (!force && fs.existsSync(configPath)) {
    return Err(new CLIError(
      'Project already initialized. Use --force to overwrite.',
      ExitCode.ERROR
    ));
  }

  const filesCreated: string[] = [];

  try {
    // Create config
    const config = CONFIG_TEMPLATE(name);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    filesCreated.push('harness.config.json');

    // Create AGENTS.md
    if (!fs.existsSync(agentsPath) || force) {
      fs.writeFileSync(agentsPath, AGENTS_MD_TEMPLATE(name));
      filesCreated.push('AGENTS.md');
    }

    // Create docs directory
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'index.md'), DOCS_INDEX_TEMPLATE(name));
      filesCreated.push('docs/index.md');
    }

    return Ok({ filesCreated });
  } catch (error) {
    return Err(new CLIError(
      `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ExitCode.ERROR
    ));
  }
}

export function createInitCommand(): Command {
  const command = new Command('init')
    .description('Initialize a new harness-engineering project')
    .option('-n, --name <name>', 'Project name')
    .option('-f, --force', 'Overwrite existing files')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      const result = await runInit({
        name: opts.name,
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
