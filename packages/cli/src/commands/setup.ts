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
import { readMcpConfig, writeMcpEntry, writeOpencodeMcpEntry } from '../integrations/config';
import { INTEGRATION_REGISTRY } from '../integrations/registry';
import { initHooks } from './hooks/init';
import type { HookProfile } from '../hooks/profiles';
import { ensureTelemetryConfigured } from './telemetry-wizard';
import { detectLegacyArtifacts } from './migrate';
import type { StepResult } from './setup-types';

export type { StepResult };

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
      platforms: ['claude-code', 'gemini-cli', 'codex', 'cursor'],
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

async function runMcpSetup(cwd: string): Promise<StepResult[]> {
  const results: StepResult[] = [];

  const clients: Array<{ name: string; dir: string; client: string; configTarget: string }> = [
    { name: 'Claude Code', dir: '.claude', client: 'claude', configTarget: '.mcp.json' },
    {
      name: 'Gemini CLI',
      dir: '.gemini',
      client: 'gemini',
      configTarget: '.gemini/settings.json',
    },
    { name: 'Codex CLI', dir: '.codex', client: 'codex', configTarget: '.codex/config.toml' },
    { name: 'Cursor', dir: '.cursor', client: 'cursor', configTarget: '.cursor/mcp.json' },
    {
      name: 'OpenCode',
      dir: path.join('.config', 'opencode'),
      client: 'opencode',
      configTarget: 'opencode.json',
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

export function configureTier0Integrations(cwd: string): StepResult {
  try {
    const mcpPath = path.join(cwd, '.mcp.json');
    const config = readMcpConfig(mcpPath);
    const tier0 = INTEGRATION_REGISTRY.filter((i) => i.tier === 0);
    const added: string[] = [];

    for (const integration of tier0) {
      if (config.mcpServers![integration.name]) continue;
      writeMcpEntry(mcpPath, integration.name, integration.mcpConfig);
      added.push(integration.displayName);
    }

    // Gemini CLI parity: also write Tier 0 integrations to .gemini/settings.json
    const geminiDir = path.join(cwd, '.gemini');
    if (fs.existsSync(geminiDir)) {
      const geminiPath = path.join(geminiDir, 'settings.json');
      const geminiConfig = readMcpConfig(geminiPath);
      for (const integration of tier0) {
        if (!geminiConfig.mcpServers![integration.name]) {
          writeMcpEntry(geminiPath, integration.name, integration.mcpConfig);
        }
      }
    }

    // OpenCode parity: write Tier 0 integrations to ./opencode.json. Detect
    // OpenCode by an existing project-local opencode.json or a global
    // ~/.config/opencode/ presence — we only write parity if at least one
    // marker is there, so users without OpenCode don't get a stray file.
    // writeOpencodeMcpEntry is idempotent per key, so re-running setup
    // overwrites with identical content rather than duplicating entries.
    const opencodePath = path.join(cwd, 'opencode.json');
    const opencodeGlobalDir = path.join(os.homedir(), '.config', 'opencode');
    if (fs.existsSync(opencodePath) || fs.existsSync(opencodeGlobalDir)) {
      for (const integration of tier0) {
        writeOpencodeMcpEntry(opencodePath, integration.name, integration.mcpConfig);
      }
    }

    if (added.length === 0) {
      return { status: 'pass', message: 'Tier 0 MCP integrations already configured' };
    }

    return {
      status: 'pass',
      message: `Configured ${added.length} MCP integrations: ${added.join(', ')}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 'fail', message: `Tier 0 integration configuration failed — ${msg}` };
  }
}

function ensureHooks(cwd: string): StepResult {
  // Only initialize hooks if this is a harness project
  const configPath = path.join(cwd, 'harness.config.json');
  if (!fs.existsSync(configPath)) {
    return { status: 'warn', message: 'Not a harness project — skipped hook installation' };
  }

  // Detect existing profile or default to standard
  let profile: HookProfile = 'standard';
  const profilePath = path.join(cwd, '.harness', 'hooks', 'profile.json');
  try {
    const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    if (data.profile && ['minimal', 'standard', 'strict'].includes(data.profile)) {
      profile = data.profile;
    }
  } catch {
    // No existing profile — use standard
  }

  try {
    const result = initHooks({ profile, projectDir: cwd });
    return {
      status: 'pass',
      message: `Installed ${result.copiedScripts.length} hooks (${profile} profile)`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 'warn', message: `Hook installation skipped — ${msg}` };
  }
}

async function detectLegacyLayout(cwd: string): Promise<StepResult> {
  const { adrLegacy, planLegacy } = await detectLegacyArtifacts(cwd);
  if (!adrLegacy && !planLegacy) {
    return { status: 'pass', message: 'Layout up to date' };
  }
  const parts: string[] = [];
  if (adrLegacy) parts.push('.harness/architecture/');
  if (planLegacy) parts.push('docs/plans/');
  return {
    status: 'warn',
    message: `Legacy paths detected (${parts.join(', ')}) — run \`harness migrate\` to upgrade`,
  };
}

async function runInitialGraphScan(cwd: string): Promise<StepResult> {
  try {
    // Dynamic import to avoid cycles or failing immediately if graph framework isn't fully available yet
    const { runScan } = await import('./graph/scan.js');
    const result = await runScan(cwd);
    return {
      status: 'pass',
      message: `Built knowledge graph: ${result.nodeCount} nodes, ${result.edgeCount} edges`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 'warn', message: `Knowledge graph creation skipped — ${msg}` };
  }
}

export async function runSetup(cwd: string): Promise<{ steps: StepResult[]; success: boolean }> {
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
  const mcpResults = await runMcpSetup(cwd);
  steps.push(...mcpResults);

  // Step 4: Configure Tier 0 integrations
  const tier0Result = configureTier0Integrations(cwd);
  steps.push(tier0Result);

  // Step 5: Ensure hooks are installed (telemetry, adoption tracking, etc.)
  const hooksResult = ensureHooks(cwd);
  steps.push(hooksResult);

  // Step 6: Ensure telemetry is configured (interactive wizard if not)
  const telemetryResult = await ensureTelemetryConfigured(cwd);
  steps.push(telemetryResult);

  // Step 7: Initial Knowledge Graph scan
  const graphResult = await runInitialGraphScan(cwd);
  steps.push(graphResult);

  // Step 8: Detect legacy artifact layout (non-destructive — just warns)
  const legacyResult = await detectLegacyLayout(cwd);
  steps.push(legacyResult);

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
    .action(async () => {
      const cwd = process.cwd();

      console.log('');
      console.log(`  ${chalk.bold('harness setup')}`);
      console.log('');

      const { steps, success } = await runSetup(cwd);

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
