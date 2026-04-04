import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import * as clack from '@clack/prompts';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import { writeMcpEntry } from '../integrations/config';
import { writeTomlMcpEntry } from '../integrations/toml';

interface McpConfig {
  mcpServers?: Record<string, { command: string; args?: string[] }>;
  [key: string]: unknown;
}

interface TrustedFolders {
  [folderPath: string]: string;
}

const HARNESS_MCP_ENTRY = {
  command: 'harness-mcp',
};

export const CURSOR_CURATED_TOOLS: string[] = [
  'run_skill',
  'validate_project',
  'emit_interaction',
  'check_docs',
  'manage_roadmap',
  'run_code_review',
  'check_phase_gate',
  'gather_context',
  'find_context_for',
  'get_impact',
  'detect_entropy',
  'run_security_scan',
  'assess_project',
  'manage_state',
  'create_self_review',
  'analyze_diff',
  'request_peer_review',
  'review_changes',
  'check_dependencies',
  'search_skills',
  'code_search',
  'code_outline',
  'ask_graph',
  'query_graph',
  'detect_anomalies',
];

export const ALL_MCP_TOOLS: string[] = [
  'validate_project',
  'check_dependencies',
  'check_docs',
  'detect_entropy',
  'generate_linter',
  'validate_linter_config',
  'init_project',
  'list_personas',
  'generate_persona_artifacts',
  'run_persona',
  'add_component',
  'run_agent_task',
  'run_skill',
  'manage_state',
  'create_self_review',
  'analyze_diff',
  'request_peer_review',
  'check_phase_gate',
  'validate_cross_check',
  'create_skill',
  'generate_slash_commands',
  'query_graph',
  'search_similar',
  'find_context_for',
  'get_relationships',
  'get_impact',
  'ingest_source',
  'generate_agent_definitions',
  'run_security_scan',
  'check_performance',
  'get_perf_baselines',
  'update_perf_baselines',
  'get_critical_paths',
  'list_streams',
  'manage_roadmap',
  'emit_interaction',
  'run_code_review',
  'gather_context',
  'assess_project',
  'review_changes',
  'detect_anomalies',
  'ask_graph',
  'check_task_independence',
  'predict_conflicts',
  'detect_stale_constraints',
  'search_skills',
  'code_outline',
  'code_search',
  'code_unfold',
  'get_decay_trends',
  'check_traceability',
  'predict_failures',
];

/**
 * Launch an interactive multi-select picker for Cursor tool selection.
 * Shows all MCP tools with CURSOR_CURATED_TOOLS pre-selected.
 * Falls back to CURSOR_CURATED_TOOLS on non-TTY / cancel / error.
 */
export async function runCursorToolPicker(): Promise<string[]> {
  try {
    const selected = await clack.multiselect({
      message:
        'Select tools to register for Cursor (25 recommended; Cursor supports ~40 across all servers)',
      options: ALL_MCP_TOOLS.map((tool) => {
        const opt: { value: string; label: string; hint?: string } = { value: tool, label: tool };
        if (CURSOR_CURATED_TOOLS.includes(tool)) opt.hint = 'recommended';
        return opt;
      }),
      initialValues: CURSOR_CURATED_TOOLS,
    });

    if (clack.isCancel(selected)) {
      // User pressed Ctrl+C or non-TTY cancel — fall back to curated set
      return CURSOR_CURATED_TOOLS;
    }

    return selected as string[];
  } catch {
    // @clack/prompts throws in non-TTY environments — fall back gracefully
    return CURSOR_CURATED_TOOLS;
  }
}

/**
 * Write Cursor MCP entry scoped to a specific tool list.
 * Passes selected tools as --tools args to the harness MCP server.
 */
function writeCursorMcpEntryWithTools(configPath: string, tools: string[]): void {
  writeMcpEntry(configPath, 'harness', {
    command: 'harness',
    args: ['mcp', '--tools', ...tools],
  });
}

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

export function setupMcp(
  cwd: string,
  client: string
): { configured: string[]; skipped: string[]; trustedFolder: boolean } {
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

  if (client === 'all' || client === 'codex') {
    const configPath = path.join(cwd, '.codex', 'config.toml');
    const alreadyConfigured = (() => {
      if (!fs.existsSync(configPath)) return false;
      const content = fs.readFileSync(configPath, 'utf-8');
      return content.includes('[mcp_servers.harness]');
    })();
    if (alreadyConfigured) {
      skipped.push('Codex CLI');
    } else {
      writeTomlMcpEntry(configPath, 'harness', {
        command: 'harness',
        args: ['mcp'],
        enabled: true,
      });
      configured.push('Codex CLI');
    }
  }

  if (client === 'all' || client === 'cursor') {
    const configPath = path.join(cwd, '.cursor', 'mcp.json');
    const existing = readJsonFile<McpConfig>(configPath);
    if (existing?.mcpServers?.['harness']) {
      skipped.push('Cursor');
    } else {
      writeMcpEntry(configPath, 'harness', { command: 'harness', args: ['mcp'] });
      configured.push('Cursor');
    }
  }

  return { configured, skipped, trustedFolder };
}

async function resolveCursorWithPicker(
  cwd: string,
  pick: boolean
): Promise<{ configured: string[]; skipped: string[] }> {
  const configured: string[] = [];
  const skipped: string[] = [];
  const cursorConfigPath = path.join(cwd, '.cursor', 'mcp.json');
  const existing = readJsonFile<McpConfig>(cursorConfigPath);
  if (existing?.mcpServers?.['harness'] && !pick) {
    skipped.push('Cursor');
  } else {
    const tools = pick ? await runCursorToolPicker() : CURSOR_CURATED_TOOLS;
    writeCursorMcpEntryWithTools(cursorConfigPath, tools);
    configured.push('Cursor');
  }
  return { configured, skipped };
}

function printMcpResult(configured: string[], skipped: string[], trustedFolder: boolean): void {
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
  console.log(
    `  - ${ALL_MCP_TOOLS.length} tools for validation, entropy detection, skill execution, graph querying, and more`
  );
  console.log(
    '  - 8 resources for project context, skills, rules, learnings, state, and graph data'
  );
  console.log('');
  console.log(`Run ${chalk.cyan('harness skill list')} to see available skills.`);
  console.log('');
}

export function createSetupMcpCommand(): Command {
  return new Command('setup-mcp')
    .description('Configure MCP server for AI agent integration')
    .option('--client <client>', 'Client to configure (claude, gemini, codex, cursor, all)', 'all')
    .option('--pick', 'Launch interactive tool picker (Cursor only)')
    .option('--yes', 'Bypass interactive picker and use curated 25-tool set (Cursor only)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      let configured: string[];
      let skipped: string[];
      let trustedFolder = false;

      // Cursor with --pick or --yes: handle async tool selection separately
      if (opts.client === 'cursor' && (opts.pick || opts.yes)) {
        ({ configured, skipped } = await resolveCursorWithPicker(cwd, opts.pick));
      } else {
        // Standard path: synchronous setupMcp handles all clients
        ({ configured, skipped, trustedFolder } = setupMcp(cwd, opts.client));
      }

      if (!globalOpts.quiet) {
        printMcpResult(configured, skipped, trustedFolder);
      }

      process.exit(ExitCode.SUCCESS);
    });
}
