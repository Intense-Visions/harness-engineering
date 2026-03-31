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
export function createListIntegrationsCommand(): Command {
  return new Command('list')
    .description('Show all MCP integrations with status')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const mcpPath = path.join(cwd, '.mcp.json');
      const configPath = path.join(cwd, 'harness.config.json');

      const mcpConfig = readMcpConfig(mcpPath);
      const integConfig = readIntegrationsConfig(configPath);
      const mcpServers = mcpConfig.mcpServers ?? {};

      const tier0 = INTEGRATION_REGISTRY.filter((i) => i.tier === 0);
      const tier1 = INTEGRATION_REGISTRY.filter((i) => i.tier === 1);

      if (globalOpts.json) {
        const entries = INTEGRATION_REGISTRY.map((i) => ({
          name: i.name,
          tier: i.tier,
          configured: i.name in mcpServers,
          enabled: integConfig.enabled.includes(i.name),
          dismissed: integConfig.dismissed.includes(i.name),
          envVar: i.envVar ?? null,
          envVarSet: i.envVar ? !!process.env[i.envVar] : null,
        }));
        console.log(JSON.stringify(entries, null, 2));
        process.exit(ExitCode.SUCCESS);
        return;
      }

      console.log('');
      console.log('MCP Integrations:');
      console.log('');
      console.log('  Tier 0 (zero-config):');
      for (const i of tier0) {
        const configured = i.name in mcpServers;
        const icon = configured ? chalk.green('\u2713') : chalk.dim('\u25CB');
        console.log(`    ${icon} ${i.name.padEnd(22)} ${i.description}`);
      }

      console.log('');
      console.log('  Tier 1 (API key required):');
      for (const i of tier1) {
        const configured = i.name in mcpServers;
        const dismissed = integConfig.dismissed.includes(i.name);
        const icon = configured ? chalk.green('\u2713') : chalk.dim('\u25CB');
        let suffix = '';
        if (dismissed) {
          suffix = chalk.dim('[dismissed]');
        } else if (i.envVar) {
          const envSet = !!process.env[i.envVar];
          suffix = `${i.envVar} ${envSet ? chalk.green('\u2713') : chalk.yellow('not set')}`;
        }
        console.log(`    ${icon} ${i.name.padEnd(22)} ${i.description.padEnd(35)} ${suffix}`);
      }

      console.log('');
      console.log(
        `  Run '${chalk.cyan('harness integrations add <name>')}' to enable a Tier 1 integration.`
      );
      console.log('');
      process.exit(ExitCode.SUCCESS);
    });
}
