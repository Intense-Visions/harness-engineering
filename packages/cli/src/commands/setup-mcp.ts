import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

interface McpConfig {
  mcpServers?: Record<string, { command: string; args: string[] }>;
  [key: string]: unknown;
}

interface TrustedFolders {
  [folderPath: string]: string;
}

const HARNESS_MCP_ENTRY = {
  command: 'npx',
  args: ['@harness-engineering/mcp-server'],
};

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    fs.copyFileSync(filePath, filePath + '.bak');
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function configureMcpServer(configPath: string): boolean {
  const config: McpConfig = readJsonFile<McpConfig>(configPath) ?? {};

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  if (config.mcpServers['harness']) {
    return false;
  }

  config.mcpServers['harness'] = HARNESS_MCP_ENTRY;
  writeJsonFile(configPath, config);
  return true;
}

function addGeminiTrustedFolder(cwd: string): boolean {
  const trustedPath = path.join(os.homedir(), '.gemini', 'trustedFolders.json');
  const folders: TrustedFolders = readJsonFile<TrustedFolders>(trustedPath) ?? {};

  if (folders[cwd] === 'TRUST_FOLDER') {
    return false;
  }

  folders[cwd] = 'TRUST_FOLDER';
  writeJsonFile(trustedPath, folders);
  return true;
}

export function setupMcp(cwd: string, client: string): { configured: string[]; skipped: string[]; trustedFolder: boolean } {
  const configured: string[] = [];
  const skipped: string[] = [];
  let trustedFolder = false;

  if (client === 'all' || client === 'claude') {
    const configPath = path.join(cwd, '.mcp.json');
    if (configureMcpServer(configPath)) {
      configured.push('Claude Code');
    } else {
      skipped.push('Claude Code');
    }
  }

  if (client === 'all' || client === 'gemini') {
    const configPath = path.join(cwd, '.gemini', 'settings.json');
    if (configureMcpServer(configPath)) {
      configured.push('Gemini CLI');
    } else {
      skipped.push('Gemini CLI');
    }
    trustedFolder = addGeminiTrustedFolder(cwd);
  }

  return { configured, skipped, trustedFolder };
}

export function createSetupMcpCommand(): Command {
  return new Command('setup-mcp')
    .description('Configure MCP server for AI agent integration')
    .option('--client <client>', 'Client to configure (claude, gemini, all)', 'all')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      const { configured, skipped, trustedFolder } = setupMcp(cwd, opts.client);

      if (!globalOpts.quiet) {
        console.log('');
        if (configured.length > 0) {
          logger.success('MCP server configured!');
          console.log('');
          for (const name of configured) {
            console.log(`  ${chalk.green('+')} ${name}`);
          }
        }
        if (trustedFolder) {
          console.log('');
          logger.info('Added project to Gemini trusted folders (~/.gemini/trustedFolders.json)');
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
