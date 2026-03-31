import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';
import { checkNodeVersion as checkNode } from '../utils/node-version';
import { ExitCode } from '../utils/errors';

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail';
  message: string;
  fix?: string;
}

export interface DoctorResult {
  checks: CheckResult[];
  allPassed: boolean;
}

function checkNodeVersion(): CheckResult {
  const result = checkNode();
  if (result.satisfies) {
    return {
      name: 'node',
      status: 'pass',
      message: `Node.js ${result.current} (requires ${result.required})`,
    };
  }
  return {
    name: 'node',
    status: 'fail',
    message: `Node.js ${result.current} (requires ${result.required})`,
    fix: 'Install Node.js >= 22: https://nodejs.org/',
  };
}

function countCommandFiles(dir: string, ext: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

function checkSlashCommands(): CheckResult[] {
  const platforms: Array<{ name: string; dir: string; ext: string; client: string }> = [
    {
      name: 'Claude Code',
      dir: path.join(os.homedir(), '.claude', 'commands', 'harness'),
      ext: '.md',
      client: 'claude-code',
    },
    {
      name: 'Gemini CLI',
      dir: path.join(os.homedir(), '.gemini', 'commands', 'harness'),
      ext: '.toml',
      client: 'gemini-cli',
    },
  ];

  return platforms.map(({ name, dir, ext, client }) => {
    const count = countCommandFiles(dir, ext);
    if (count > 0) {
      return {
        name: `slash-commands-${client}`,
        status: 'pass' as const,
        message: `Slash commands installed -> ${dir} (${count} commands)`,
      };
    }
    return {
      name: `slash-commands-${client}`,
      status: 'fail' as const,
      message: `No slash commands found for ${name}`,
      fix: 'Run: harness setup',
    };
  });
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function checkMcpConfig(cwd: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Claude Code: check cwd/.mcp.json
  const claudeConfigPath = path.join(cwd, '.mcp.json');
  const claudeConfig = readJsonSafe<McpConfig>(claudeConfigPath);
  if (claudeConfig?.mcpServers?.['harness']) {
    results.push({
      name: 'mcp-claude',
      status: 'pass',
      message: 'MCP configured for Claude Code',
    });
  } else {
    results.push({
      name: 'mcp-claude',
      status: 'fail',
      message: 'MCP not configured for Claude Code',
      fix: 'Run: harness setup-mcp --client claude',
    });
  }

  // Gemini CLI: check cwd/.gemini/settings.json (where setup-mcp writes it)
  const geminiConfigPath = path.join(cwd, '.gemini', 'settings.json');
  const geminiConfig = readJsonSafe<McpConfig>(geminiConfigPath);
  if (geminiConfig?.mcpServers?.['harness']) {
    results.push({
      name: 'mcp-gemini',
      status: 'pass',
      message: 'MCP configured for Gemini CLI',
    });
  } else {
    results.push({
      name: 'mcp-gemini',
      status: 'fail',
      message: 'MCP not configured for Gemini CLI',
      fix: 'Run: harness setup-mcp --client gemini',
    });
  }

  return results;
}

export function runDoctor(cwd: string): DoctorResult {
  const checks: CheckResult[] = [];

  checks.push(checkNodeVersion());
  checks.push(...checkSlashCommands());
  checks.push(...checkMcpConfig(cwd));

  const allPassed = checks.every((c) => c.status === 'pass');

  return { checks, allPassed };
}

function formatCheck(check: CheckResult): string {
  const icon = check.status === 'pass' ? chalk.green('✓') : chalk.red('✗');
  let line = `  ${icon} ${check.message}`;
  if (check.status === 'fail' && check.fix) {
    line += `\n    -> ${check.fix}`;
  }
  return line;
}

export function createDoctorCommand(): Command {
  return new Command('doctor')
    .description('Check environment health: Node version, slash commands, MCP configuration')
    .action((_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const useJson = globalOpts.json;

      const result = runDoctor(cwd);

      if (useJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('');
        console.log(`  ${chalk.bold('harness doctor')}`);
        console.log('');

        for (const check of result.checks) {
          console.log(formatCheck(check));
        }

        console.log('');
        const passed = result.checks.filter((c) => c.status === 'pass').length;
        const total = result.checks.length;
        console.log(`  ${passed}/${total} checks passed`);
        console.log('');
      }

      process.exit(result.allPassed ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });
}
