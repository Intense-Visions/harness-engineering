import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';
import { generateSlashCommands } from './generate-slash-commands';
import { setupMcp } from './setup-mcp';
import { markSetupComplete } from '../utils/first-run';
import { checkNodeVersion as checkNode } from '../utils/node-version';
import { ExitCode } from '../utils/errors';

export interface StepResult {
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

function checkNodeVersion(): StepResult {
  const result = checkNode();
  if (result.satisfies) {
    return { status: 'pass', message: `Node.js ${result.current} (requires ${result.required})` };
  }
  return { status: 'fail', message: `Node.js ${result.current} — requires ${result.required}` };
}

function runSlashCommandGeneration(): StepResult {
  try {
    const results = generateSlashCommands({
      global: true,
      platforms: ['claude-code', 'gemini-cli'],
      yes: true,
      includeGlobal: false,
      skillsDir: '',
      dryRun: false,
    });
    const outputDirs = results.map((r) => r.outputDir).join(', ');
    return { status: 'pass', message: `Generated global slash commands -> ${outputDirs}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 'fail', message: `Slash command generation failed — ${msg}` };
  }
}

function detectClient(dirName: string): boolean {
  return fs.existsSync(path.join(os.homedir(), dirName));
}

function runMcpSetup(cwd: string): StepResult[] {
  const results: StepResult[] = [];

  const clients: Array<{ name: string; dir: string; client: string; configTarget: string }> = [
    { name: 'Claude Code', dir: '.claude', client: 'claude', configTarget: '.mcp.json' },
    {
      name: 'Gemini CLI',
      dir: '.gemini',
      client: 'gemini',
      configTarget: '.gemini/settings.json',
    },
  ];

  for (const { name, dir, client, configTarget } of clients) {
    if (!detectClient(dir)) {
      results.push({
        status: 'warn',
        message: `${name} not detected — skipped MCP configuration`,
      });
      continue;
    }
    try {
      setupMcp(cwd, client);
      results.push({ status: 'pass', message: `Configured MCP for ${name} -> ${configTarget}` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({
        status: 'fail',
        message: `MCP configuration failed for ${name} — ${msg}`,
      });
    }
  }

  return results;
}

function formatStep(result: StepResult): string {
  const icon =
    result.status === 'pass'
      ? chalk.green('✓')
      : result.status === 'warn'
        ? chalk.yellow('⚠')
        : chalk.red('✗');
  return `  ${icon} ${result.message}`;
}

export function runSetup(cwd: string): { steps: StepResult[]; success: boolean } {
  const steps: StepResult[] = [];

  // Step 1: Node version check
  const nodeResult = checkNodeVersion();
  steps.push(nodeResult);
  if (nodeResult.status === 'fail') {
    return { steps, success: false };
  }

  // Step 2: Generate global slash commands
  const slashResult = runSlashCommandGeneration();
  steps.push(slashResult);

  // Step 3: MCP setup for detected clients
  const mcpResults = runMcpSetup(cwd);
  steps.push(...mcpResults);

  // Determine success: no 'fail' status in any step
  const success = steps.every((s) => s.status !== 'fail');

  if (success) {
    markSetupComplete();
  }

  return { steps, success };
}

export function createSetupCommand(): Command {
  return new Command('setup')
    .description('Configure harness environment: slash commands, MCP, and more')
    .action(() => {
      const cwd = process.cwd();

      console.log('');
      console.log(`  ${chalk.bold('harness setup')}`);
      console.log('');

      const { steps, success } = runSetup(cwd);

      for (const step of steps) {
        console.log(formatStep(step));
      }

      console.log('');

      if (success) {
        console.log('  Setup complete. Next steps:');
        console.log('    - Open a project directory and run /harness:initialize-project');
        console.log('    - Or run harness init --name my-project to scaffold a new one');
        console.log('    - Run harness doctor anytime to check your environment');
        console.log('');
      }

      process.exit(success ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });
}
