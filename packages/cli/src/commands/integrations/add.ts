import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import {
  writeMcpEntry,
  readIntegrationsConfig,
  writeIntegrationsConfig,
} from '../../integrations/config';
import { CLIError, ExitCode } from '../../utils/errors';
import { logger } from '../../output/logger';

interface AddResult {
  name: string;
  displayName: string;
  envVarMissing: boolean;
  envVar?: string;
  installHint?: string;
}

type McpEntry = { command: string; args?: string[]; env?: Record<string, string> };

function buildMcpEntry(def: (typeof INTEGRATION_REGISTRY)[number]): McpEntry {
  const entry: McpEntry = { command: def.mcpConfig.command };
  if (def.mcpConfig.args.length > 0) entry.args = def.mcpConfig.args;
  if (def.mcpConfig.env) entry.env = def.mcpConfig.env;
  return entry;
}

function writeMcpEntries(cwd: string, defName: string, mcpEntry: McpEntry): void {
  writeMcpEntry(path.join(cwd, '.mcp.json'), defName, mcpEntry);
  const geminiDir = path.join(cwd, '.gemini');
  if (fs.existsSync(geminiDir)) {
    writeMcpEntry(path.join(geminiDir, 'settings.json'), defName, mcpEntry);
  }
}

function updateIntegrationsConfig(cwd: string, defName: string): void {
  const configPath = path.join(cwd, 'harness.config.json');
  const integConfig = readIntegrationsConfig(configPath);
  if (!integConfig.enabled.includes(defName)) integConfig.enabled.push(defName);
  integConfig.dismissed = integConfig.dismissed.filter((d) => d !== defName);
  writeIntegrationsConfig(configPath, integConfig);
}

/**
 * Core logic for adding an integration. Separated from Commander for testability.
 */
export function addIntegration(cwd: string, name: string): Result<AddResult, CLIError> {
  const def = INTEGRATION_REGISTRY.find((i) => i.name === name);
  if (!def) {
    return Err(
      new CLIError(
        `Integration '${name}' not found in registry. Run 'harness integrations list' to see available integrations.`,
        ExitCode.ERROR
      )
    );
  }
  if (def.tier === 0) {
    return Err(
      new CLIError(
        `${def.displayName} is a Tier 0 integration, already configured by 'harness setup'. Run 'harness setup' if missing.`,
        ExitCode.ERROR
      )
    );
  }

  const mcpEntry = buildMcpEntry(def);
  writeMcpEntries(cwd, def.name, mcpEntry);
  updateIntegrationsConfig(cwd, def.name);

  return Ok({
    name: def.name,
    displayName: def.displayName,
    envVarMissing: !!def.envVar && !process.env[def.envVar],
    ...(def.envVar !== undefined && { envVar: def.envVar }),
    ...(def.installHint !== undefined && { installHint: def.installHint }),
  });
}

function printAddSuccess(value: AddResult): void {
  console.log('');
  logger.success(`${value.displayName} integration enabled.`);
  console.log('');
  if (value.envVarMissing && value.envVar) {
    logger.warn(`Set ${chalk.bold(value.envVar)} in your environment to activate.`);
    if (value.installHint) console.log(`  ${chalk.dim(value.installHint)}`);
    console.log('');
  }
}

/**
 * Creates the 'integrations add' subcommand.
 */
export function createAddIntegrationCommand(): Command {
  return new Command('add')
    .description('Enable an MCP integration')
    .argument('<name>', 'Integration name (e.g. perplexity, augment-code)')
    .action(async (name: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const result = addIntegration(process.cwd(), name);
      if (!result.ok) {
        if (!globalOpts.quiet) logger.error(result.error.message);
        process.exit(result.error.exitCode);
        return;
      }
      if (!globalOpts.quiet) printAddSuccess(result.value);
      process.exit(ExitCode.SUCCESS);
    });
}
