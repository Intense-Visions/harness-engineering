// packages/cli/src/commands/migrate-backends.ts
//
// One-shot migration: copy `agent.backends` (and `agent.routing` when
// present) from harness.orchestrator.md into harness.config.json so
// the craft selector and the orchestrator share a single source of truth.
//
// This is the migration path for users who declared backends in
// harness.orchestrator.md before the shared-config change landed.
//
// Safety:
//   - Refuses to overwrite an existing `agent.backends` in harness.config.json
//     unless --force is passed.
//   - --dry-run prints the diff without writing.
//   - Leaves harness.orchestrator.md untouched.

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  findOrchestratorMd,
  readBackendsFromOrchestratorMd,
} from '../shared/craft/llm/orchestrator-md';
import { parse as parseYaml } from 'yaml';

interface MigrateBackendsOptions {
  dryRun?: boolean;
  force?: boolean;
  cwd?: string;
}

interface MigrateResult {
  status: 'ok' | 'noop' | 'error';
  message: string;
  exitCode: number;
}

export async function runMigrateBackends(
  opts: MigrateBackendsOptions = {}
): Promise<MigrateResult> {
  const cwd = opts.cwd ?? process.cwd();
  const mdPath = findOrchestratorMd(cwd);
  if (mdPath === null) {
    return {
      status: 'noop',
      message: 'No harness.orchestrator.md found — nothing to migrate.',
      exitCode: ExitCode.SUCCESS,
    };
  }

  const backends = readBackendsFromOrchestratorMd(cwd);
  if (backends === null) {
    return {
      status: 'noop',
      message: `Found ${mdPath} but no agent.backends to migrate.`,
      exitCode: ExitCode.SUCCESS,
    };
  }
  const routing = readRoutingFromOrchestratorMd(mdPath);

  // Locate harness.config.json — start at the same directory as harness.orchestrator.md.
  const jsonPath = path.join(path.dirname(mdPath), 'harness.config.json');
  if (!fs.existsSync(jsonPath)) {
    return {
      status: 'error',
      message:
        `harness.config.json not found at ${jsonPath}. ` +
        'Run `harness init` first, then re-run this migration.',
      exitCode: ExitCode.ERROR,
    };
  }

  let configRaw: string;
  try {
    configRaw = fs.readFileSync(jsonPath, 'utf-8');
  } catch (err) {
    return {
      status: 'error',
      message: `Failed to read ${jsonPath}: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: ExitCode.ERROR,
    };
  }
  let configObj: Record<string, unknown>;
  try {
    configObj = JSON.parse(configRaw) as Record<string, unknown>;
  } catch (err) {
    return {
      status: 'error',
      message: `${jsonPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: ExitCode.ERROR,
    };
  }

  const agent = (configObj.agent as Record<string, unknown> | undefined) ?? {};
  const existingBackends = agent.backends as Record<string, unknown> | undefined;
  if (existingBackends !== undefined && !opts.force) {
    return {
      status: 'error',
      message:
        `${jsonPath} already declares agent.backends. ` +
        'Re-run with --force to overwrite, or merge manually.',
      exitCode: ExitCode.ERROR,
    };
  }

  const nextAgent: Record<string, unknown> = { ...agent, backends };
  if (routing !== null) nextAgent.routing = routing;
  const nextConfig = { ...configObj, agent: nextAgent };
  const nextJson = JSON.stringify(nextConfig, null, 2) + '\n';

  if (opts.dryRun) {
    logger.info(chalk.bold('--- dry run ---'));
    logger.info(`Would write ${Object.keys(backends).length} backend(s) to ${jsonPath}:`);
    for (const name of Object.keys(backends)) {
      logger.info(`  • ${name}`);
    }
    if (routing !== null) {
      logger.info('Would also copy agent.routing.');
    }
    return {
      status: 'ok',
      message: '(dry-run) migration plan above — re-run without --dry-run to apply.',
      exitCode: ExitCode.SUCCESS,
    };
  }

  try {
    fs.writeFileSync(jsonPath, nextJson);
  } catch (err) {
    return {
      status: 'error',
      message: `Failed to write ${jsonPath}: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: ExitCode.ERROR,
    };
  }

  return {
    status: 'ok',
    message:
      `Migrated ${Object.keys(backends).length} backend(s)${routing !== null ? ' + routing' : ''} ` +
      `from ${mdPath} to ${jsonPath}. ` +
      'You can leave the entries in harness.orchestrator.md (orchestrator still reads them) ' +
      'or remove them once the orchestrator config picks up the JSON source.',
    exitCode: ExitCode.SUCCESS,
  };
}

function readRoutingFromOrchestratorMd(mdPath: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(mdPath, 'utf-8');
  } catch {
    return null;
  }
  const parts = raw.split('---');
  if (parts.length < 3) return null;
  let parsed: unknown;
  try {
    parsed = parseYaml(parts[1]!.trim());
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const agent = (parsed as { agent?: unknown }).agent;
  if (agent === null || typeof agent !== 'object') return null;
  const routing = (agent as { routing?: unknown }).routing;
  return routing ?? null;
}

/**
 * Subcommand factory — attached to `harness migrate` via `.addCommand()`.
 * Invocation: `harness migrate backends [--dry-run] [--force]`.
 */
export function createBackendsSubcommand(): Command {
  return new Command('backends')
    .description(
      'Copy agent.backends (and routing) from harness.orchestrator.md into harness.config.json.'
    )
    .option('--dry-run', 'Show what would change without writing', false)
    .option('--force', 'Overwrite existing agent.backends in harness.config.json', false)
    .action(async (options: { dryRun?: boolean; force?: boolean }) => {
      const result = await runMigrateBackends({
        dryRun: options.dryRun ?? false,
        force: options.force ?? false,
      });
      if (result.status === 'error') {
        logger.error(result.message);
        process.exit(result.exitCode);
      }
      logger.info(result.message);
      process.exit(result.exitCode);
    });
}
