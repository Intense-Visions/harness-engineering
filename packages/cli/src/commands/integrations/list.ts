import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import { readMcpConfig, readIntegrationsConfig } from '../../integrations/config';
import { ExitCode } from '../../utils/errors';

/**
 * Creates the 'integrations list' subcommand.
 * Shows all integrations with status (configured/available/dismissed).
 */
function printTier0Integrations(
  tier0: typeof INTEGRATION_REGISTRY,
  mcpServers: Record<string, unknown>
): void {
  console.log('  Tier 0 (zero-config):');
  for (const i of tier0) {
    const icon = i.name in mcpServers ? chalk.green('\u2713') : chalk.dim('\u25CB');
    console.log(`    ${icon} ${i.name.padEnd(22)} ${i.description}`);
  }
}

function printTier1Integrations(
  tier1: typeof INTEGRATION_REGISTRY,
  mcpServers: Record<string, unknown>,
  dismissed: string[]
): void {
  console.log('  Tier 1 (API key required):');
  for (const i of tier1) {
    const icon = i.name in mcpServers ? chalk.green('\u2713') : chalk.dim('\u25CB');
    let suffix = '';
    if (dismissed.includes(i.name)) {
      suffix = chalk.dim('[dismissed]');
    } else if (i.envVar) {
      suffix = `${i.envVar} ${process.env[i.envVar] ? chalk.green('\u2713') : chalk.yellow('not set')}`;
    }
    console.log(`    ${icon} ${i.name.padEnd(22)} ${i.description.padEnd(35)} ${suffix}`);
  }
}

async function runListIntegrations(globalOpts: Record<string, unknown>): Promise<void> {
  const cwd = process.cwd();
  const mcpConfig = readMcpConfig(path.join(cwd, '.mcp.json'));
  const integConfig = readIntegrationsConfig(path.join(cwd, 'harness.config.json'));
  const mcpServers = (mcpConfig.mcpServers ?? {}) as Record<string, unknown>;

  if (globalOpts.json) {
    const entries = INTEGRATION_REGISTRY.map((i) => ({
      name: i.name,
      tier: i.tier,
      configured: i.name in mcpServers,
      enabled: integConfig.enabled.includes(i.name),
      dismissed: integConfig.dismissed.includes(i.name),
      envVar: i.envVar ?? null,
      envVarSet: i.envVar ? Boolean(process.env[i.envVar]) : null,
    }));
    console.log(JSON.stringify(entries, null, 2));
    process.exit(ExitCode.SUCCESS);
  }

  const tier0 = INTEGRATION_REGISTRY.filter((i) => i.tier === 0);
  const tier1 = INTEGRATION_REGISTRY.filter((i) => i.tier === 1);

  console.log('');
  console.log('MCP Integrations:');
  console.log('');
  printTier0Integrations(tier0, mcpServers);
  console.log('');
  printTier1Integrations(tier1, mcpServers, integConfig.dismissed);
  console.log('');
  console.log(
    `  Run '${chalk.cyan('harness integrations add <name>')}' to enable a Tier 1 integration.`
  );
  console.log('');
  process.exit(ExitCode.SUCCESS);
}

export function createListIntegrationsCommand(): Command {
  return new Command('list')
    .description('Show all MCP integrations with status')
    .action(async (_opts, cmd) => runListIntegrations(cmd.optsWithGlobals()));
}
