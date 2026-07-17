import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import {
  readMcpConfig,
  readIntegrationsConfig,
  writeIntegrationsConfig,
  removeMcpEntry,
} from '../../integrations/config';
import { reconcileIntegrations } from '../../integrations/reconcile';
import type { ConfiguredServer } from '../../integrations/reconcile';
import { addIntegration, buildMcpEntry, writeMcpEntries, updateIntegrationsConfig } from './add';
import { ExitCode } from '../../utils/errors';
import { logger } from '../../output/logger';

/**
 * Options for a sync run. `--dry-run` (report-only) is the default: it is the
 * absence of both `--apply` and `--yes`.
 */
export interface SyncOptions {
  apply?: boolean;
  yes?: boolean;
}

/**
 * Injectable IO so the command is testable without real stdin/stdout and so
 * the TTY gate (D2) can be driven deterministically in tests.
 */
export interface SyncIO {
  /** Whether stdout is a TTY. Controls the interactive-consent gate (D2). */
  isTTY: boolean;
  /** Ask a yes/no question. Only called when interactive consent is required. */
  confirm: (question: string) => Promise<boolean>;
  /** Line-oriented output sink (defaults to console.log). */
  log: (message?: string) => void;
}

/** Default IO: real TTY detection + a minimal readline yes/no prompt. */
export function defaultSyncIO(): SyncIO {
  return {
    isTTY: Boolean(process.stdout.isTTY),
    log: (message = '') => console.log(message),
    confirm: (question: string) =>
      new Promise<boolean>((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`${question} [y/N] `, (answer) => {
          rl.close();
          resolve(/^y(es)?$/i.test(answer.trim()));
        });
      }),
  };
}

/** Read the project's configured MCP servers the same way `list.ts` does. */
export function readConfiguredServers(cwd: string): ConfiguredServer[] {
  const mcpConfig = readMcpConfig(path.join(cwd, '.mcp.json'));
  const mcpServers = mcpConfig.mcpServers ?? {};
  return Object.keys(mcpServers).map((name) => ({ name }));
}

/**
 * Directly add a Tier-0 server, reusing add.ts's config plumbing.
 * (`addIntegration` intentionally rejects Tier-0, so reconcile writes the
 * entry with the same helpers `add` uses rather than duplicating IO.)
 */
function applyTier0Add(cwd: string, def: (typeof INTEGRATION_REGISTRY)[number]): void {
  writeMcpEntries(cwd, def.name, buildMcpEntry(def));
  updateIntegrationsConfig(cwd, def.name);
}

/** Remove a deprecated (no-longer-in-registry) configured server. */
function applyDeprecatedRemove(cwd: string, name: string): void {
  removeMcpEntry(path.join(cwd, '.mcp.json'), name);
  const geminiDir = path.join(cwd, '.gemini');
  if (fs.existsSync(geminiDir)) {
    removeMcpEntry(path.join(geminiDir, 'settings.json'), name);
  }
  const configPath = path.join(cwd, 'harness.config.json');
  const integConfig = readIntegrationsConfig(configPath);
  integConfig.enabled = integConfig.enabled.filter((e) => e !== name);
  writeIntegrationsConfig(configPath, integConfig);
}

/** Dismiss a deprecated server so future suggestions stay quiet. */
function applyDeprecatedDismiss(cwd: string, name: string): void {
  const configPath = path.join(cwd, 'harness.config.json');
  const integConfig = readIntegrationsConfig(configPath);
  if (!integConfig.dismissed.includes(name)) integConfig.dismissed.push(name);
  integConfig.enabled = integConfig.enabled.filter((e) => e !== name);
  writeIntegrationsConfig(configPath, integConfig);
}

/** Report the Tier-1 env-var requirement surfaced by `addIntegration`. */
function reportTier1Env(
  value: { envVarMissing: boolean; envVar?: string; installHint?: string },
  io: SyncIO
): void {
  if (!(value.envVarMissing && value.envVar)) return;
  logger.warn(`  Set ${chalk.bold(value.envVar)} to activate.`);
  if (value.installHint) io.log(`  ${chalk.dim(value.installHint)}`);
}

/** Apply a single addition (Tier-0 direct; Tier-1 via addIntegration). */
function applyOneAdd(cwd: string, def: (typeof INTEGRATION_REGISTRY)[number], io: SyncIO): void {
  if (def.tier === 0) {
    applyTier0Add(cwd, def);
    logger.success(`Added ${def.displayName} (Tier 0).`);
    return;
  }
  // Tier-1: reuse addIntegration — writes config + surfaces env need.
  const result = addIntegration(cwd, def.name);
  if (!result.ok) {
    logger.warn(`  Skipped ${def.name}: ${result.error.message}`);
    return;
  }
  logger.success(`Added ${def.displayName} (Tier 1).`);
  reportTier1Env(result.value, io);
}

/** Apply a single deprecated server: remove on consent, else dismiss. */
function applyOneDeprecated(cwd: string, name: string, remove: boolean): void {
  if (remove) {
    applyDeprecatedRemove(cwd, name);
    logger.success(`Removed ${name}.`);
    return;
  }
  applyDeprecatedDismiss(cwd, name);
  logger.info(`Dismissed ${name} (kept, silenced future suggestions).`);
}

/**
 * Core sync orchestration (read → plan → print → consent → apply). Returns an
 * exit code. All IO is injected so this is fully testable.
 *
 * Consent gating (D2):
 *  - no flags               => report-only, mutates nothing.
 *  - `--apply` + TTY        => prompt per change group; apply only agreed.
 *  - `--yes`                => apply without prompting.
 *  - non-TTY without `--yes`=> report-only even with `--apply` (print WOULD-do).
 */
export async function runSyncIntegrations(
  cwd: string,
  opts: SyncOptions,
  io: SyncIO
): Promise<number> {
  const configured = readConfiguredServers(cwd);
  const plan = reconcileIntegrations(configured, INTEGRATION_REGISTRY);

  io.log('');
  io.log(chalk.bold('MCP catalog reconcile'));
  io.log('');

  if (plan.toAdd.length === 0 && plan.deprecated.length === 0) {
    logger.success('In sync — no changes. Configured servers match the catalog.');
    io.log('');
    return ExitCode.SUCCESS;
  }

  // --- Report the plan (always) -----------------------------------------
  if (plan.toAdd.length > 0) {
    io.log(chalk.bold('  Newly suggested:'));
    for (const def of plan.toAdd) {
      const tier = def.tier === 0 ? 'Tier 0' : 'Tier 1';
      const envNote =
        def.tier === 1 && def.envVar ? ` ${chalk.yellow(`(requires ${def.envVar})`)}` : '';
      io.log(`    ${chalk.green('+')} ${def.name.padEnd(22)} ${chalk.dim(tier)}${envNote}`);
    }
    io.log('');
  }
  if (plan.deprecated.length > 0) {
    io.log(chalk.bold('  Deprecated (no longer in catalog):'));
    for (const server of plan.deprecated) {
      io.log(`    ${chalk.red('-')} ${server.name}`);
    }
    io.log('');
  }

  // --- Consent gate (D2) -------------------------------------------------
  // report-only unless (--yes) OR (--apply AND TTY).
  const willMutate = opts.yes === true || (opts.apply === true && io.isTTY);

  if (!willMutate) {
    if (opts.apply && !io.isTTY) {
      logger.info(
        'Non-interactive terminal without --yes: showing what would change (nothing applied).'
      );
    } else {
      logger.info(
        `Report-only. Re-run with ${chalk.cyan('--apply')} (interactive) or ${chalk.cyan(
          '--yes'
        )} (unattended) to apply.`
      );
    }
    io.log('');
    return ExitCode.SUCCESS;
  }

  // Interactive `--apply` prompts per group; `--yes` applies all without asking.
  const interactive = opts.yes !== true; // yes => no prompts

  // --- Apply additions ---------------------------------------------------
  if (plan.toAdd.length > 0) {
    const doAdds = interactive
      ? await io.confirm(`Add ${plan.toAdd.length} newly-suggested server(s)?`)
      : true;
    if (doAdds) {
      for (const def of plan.toAdd) applyOneAdd(cwd, def, io);
    } else {
      logger.info(`Skipped ${plan.toAdd.length} addition(s).`);
    }
    io.log('');
  }

  // --- Apply removals of deprecated servers ------------------------------
  if (plan.deprecated.length > 0) {
    const doRemoves = interactive
      ? await io.confirm(
          `Remove ${plan.deprecated.length} deprecated server(s)? (No = dismiss instead)`
        )
      : true;
    for (const server of plan.deprecated) applyOneDeprecated(cwd, server.name, doRemoves);
    io.log('');
  }

  logger.success('Reconcile complete.');
  io.log('');
  return ExitCode.SUCCESS;
}

/**
 * Creates the 'integrations sync' subcommand — reconcile the project's
 * configured MCP servers against the refreshed catalog. Report-only by
 * default; mutates only with explicit consent (D2).
 */
export function createSyncIntegrationsCommand(): Command {
  return new Command('sync')
    .description('Reconcile configured MCP servers against the catalog (report-only by default)')
    .option('--apply', 'Apply changes (prompts per group in an interactive terminal)')
    .option('--yes', 'Apply changes without prompting (for scripts/CI)')
    .action(async (opts: SyncOptions) => {
      const code = await runSyncIntegrations(process.cwd(), opts, defaultSyncIO());
      process.exit(code);
    });
}
