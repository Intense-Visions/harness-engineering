import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

interface McpConfig {
  mcpServers?: Record<string, { command: string; args: string[] }>;
  [key: string]: unknown;
}

const HARNESS_MCP_ENTRY = {
  command: 'npx',
  args: ['harness-mcp'],
};

function mergeConfig(existingPath: string, key: string): boolean {
  let config: McpConfig = {};

  if (fs.existsSync(existingPath)) {
    try {
      const content = fs.readFileSync(existingPath, 'utf-8');
      config = JSON.parse(content) as McpConfig;
    } catch {
      // If file exists but is invalid JSON, back it up
      fs.copyFileSync(existingPath, existingPath + '.bak');
      config = {};
    }
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  if (config.mcpServers[key]) {
    return false; // Already configured
  }

  config.mcpServers[key] = HARNESS_MCP_ENTRY;

  const dir = path.dirname(existingPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(existingPath, JSON.stringify(config, null, 2) + '\n');
  return true;
}

export function setupMcp(cwd: string, client: string): { configured: string[]; skipped: string[] } {
  const configured: string[] = [];
  const skipped: string[] = [];

  const clients: { name: string; configPath: string; key: string }[] = [];

  if (client === 'all' || client === 'claude') {
    clients.push({
      name: 'Claude Code',
      configPath: path.join(cwd, '.claude', 'settings.json'),
      key: 'harness',
    });
  }

  if (client === 'all' || client === 'gemini') {
    clients.push({
      name: 'Gemini CLI',
      configPath: path.join(cwd, '.gemini', 'settings.json'),
      key: 'harness',
    });
  }

  for (const c of clients) {
    const wasAdded = mergeConfig(c.configPath, c.key);
    if (wasAdded) {
      configured.push(c.name);
    } else {
      skipped.push(c.name);
    }
  }

  return { configured, skipped };
}

export function createSetupMcpCommand(): Command {
  return new Command('setup-mcp')
    .description('Configure MCP server for AI agent integration')
    .option('--client <client>', 'Client to configure (claude, gemini, all)', 'all')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      const { configured, skipped } = setupMcp(cwd, opts.client);

      if (!globalOpts.quiet) {
        console.log('');
        if (configured.length > 0) {
          logger.success('MCP server configured!');
          console.log('');
          for (const name of configured) {
            console.log(`  ${chalk.green('+')} ${name}`);
          }
        }
        if (skipped.length > 0) {
          console.log('');
          logger.info('Already configured:');
          for (const name of skipped) {
            console.log(`  ${chalk.dim('-')} ${name}`);
          }
        }
        console.log('');
        console.log(chalk.bold('The harness MCP server provides:'));
        console.log('  - 15 tools for validation, entropy detection, and skill execution');
        console.log('  - 4 resources for project context, skills, rules, and learnings');
        console.log('');
        console.log(`Run ${chalk.cyan('harness skill list')} to see available skills.`);
        console.log('');
      }

      process.exit(ExitCode.SUCCESS);
    });
}
