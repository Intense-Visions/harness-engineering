// packages/cli/src/commands/maintenance.ts
//
// Hermes Phase 2 — `harness maintenance` CLI surface.
//
// Subcommands:
//   - `list`             — built-in + customTasks merged view
//   - `show <task-id>`   — last N persisted outputs from `.harness/maintenance/<id>/outputs/`
//
// `run <task-id>` is intentionally deferred to a follow-up that lands
// alongside the Phase 0 Gateway API; the manual-trigger path requires an
// orchestrator process to dispatch through, which is outside the scope of
// this Phase 2 ship.

import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { TaskOutputStore } from '@harness-engineering/orchestrator';
import type { PersistedOutputEntry } from '@harness-engineering/orchestrator';
import { ExitCode } from '../utils/errors';
import { loadMaintenanceConfig, mergeResolvedTasks } from './maintenance-config';
import { runMaintenanceRun } from './maintenance-run';

// Re-export the task-resolution helpers (promoted to named exports for the
// `run` subcommand) so existing importers of `./maintenance` keep working.
export { loadMaintenanceConfig, mergeResolvedTasks } from './maintenance-config';

interface ListRow {
  id: string;
  origin: 'built-in' | 'custom';
  type: string;
  schedule: string;
}

function printListTable(rows: ListRow[]): void {
  if (rows.length === 0) {
    console.log(chalk.dim('No tasks defined.'));
    return;
  }
  const w = {
    id: Math.max(2, ...rows.map((r) => r.id.length)),
    origin: 8,
    type: 14,
  };
  console.log(
    chalk.bold(
      `${'ID'.padEnd(w.id)}  ${'ORIGIN'.padEnd(w.origin)}  ${'TYPE'.padEnd(w.type)}  SCHEDULE`
    )
  );
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(w.id)}  ${r.origin.padEnd(w.origin)}  ${r.type.padEnd(w.type)}  ${r.schedule}`
    );
  }
}

export function createMaintenanceCommand(): Command {
  const command = new Command('maintenance').description(
    'Inspect built-in + custom maintenance tasks and their persisted outputs'
  );

  command
    .command('list')
    .description('List all resolved maintenance tasks (built-in + customTasks)')
    .option('--json', 'Emit machine-readable JSON', false)
    .option('--path <path>', 'Project root path', '.')
    .action(async (opts) => {
      const cwd = path.resolve(opts.path);
      const config = await loadMaintenanceConfig(cwd);
      const tasks = mergeResolvedTasks(config);
      const rows: ListRow[] = tasks.map((t) => ({
        id: t.id,
        origin: t.isCustom ? 'custom' : 'built-in',
        type: t.type,
        schedule: t.schedule,
      }));
      if (opts.json) {
        console.log(JSON.stringify({ tasks: rows }, null, 2));
      } else {
        printListTable(rows);
      }
      process.exit(ExitCode.SUCCESS);
    });

  command
    .command('show <task-id>')
    .description('Show last N persisted runs for a task (from .harness/maintenance/[id]/outputs/)')
    .option('--limit <n>', 'Number of runs to show', '5')
    .option('--json', 'Emit machine-readable JSON', false)
    .option('--path <path>', 'Project root path', '.')
    .action(async (taskId, opts) => {
      await runShow(taskId, opts);
      process.exit(ExitCode.SUCCESS);
    });

  command
    .command('run [taskId...]')
    .description('Run overdue (default) / selected maintenance tasks; report-first unless --fix')
    .option('--all', 'Run all sweep-eligible tasks (not just overdue)', false)
    .option('--only <ids>', 'Comma-separated task ids to run')
    .option('--skip <ids>', 'Comma-separated task ids to exclude')
    .option('--fix', 'Dispatch fixes per task type (default: report-only)', false)
    .option('--concurrency <n>', 'Max parallel tasks (report mode); --fix forces 1')
    .option('--json', 'Emit machine-readable consolidated report', false)
    .option('--path <path>', 'Project root path', '.')
    .action(async (taskIds: string[], opts, command: Command) => {
      const cwd = path.resolve(opts.path);
      // `--json` is also declared as a GLOBAL program option (index.ts), so
      // commander binds it to the program rather than this subcommand — read
      // the merged view so `harness maintenance run --json` is honored.
      const json = Boolean(command.optsWithGlobals().json);
      const result = await runMaintenanceRun(cwd, {
        positional: taskIds,
        all: opts.all,
        only: opts.only,
        skip: opts.skip,
        fix: opts.fix,
        concurrency: opts.concurrency,
        json,
      });
      process.exit(result.exitCode);
    });

  return command;
}

interface ShowOpts {
  limit?: string;
  json?: boolean;
  path?: string;
}

async function runShow(taskId: string, opts: ShowOpts): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(taskId)) {
    console.error(`Invalid task id '${taskId}' (must match ^[a-z0-9][a-z0-9-]*$).`);
    process.exit(ExitCode.ERROR);
  }
  const cwd = path.resolve(opts.path ?? '.');
  const limit = Math.max(1, parseInt(opts.limit ?? '5', 10) || 5);
  const store = new TaskOutputStore({
    rootDir: path.join(cwd, '.harness', 'maintenance'),
  });
  const entries = await store.list(taskId, limit, 0);
  renderShow(taskId, entries, Boolean(opts.json));
}

function renderShow(taskId: string, entries: PersistedOutputEntry[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify({ taskId, entries }, null, 2));
    return;
  }
  if (entries.length === 0) {
    console.log(chalk.dim(`No persisted runs for task '${taskId}' yet.`));
    return;
  }
  console.log(chalk.bold(`Last ${entries.length} run(s) for ${taskId}:`));
  for (const e of entries) {
    console.log(formatEntryLine(e));
    if (e.error) console.log(`      ${chalk.red(e.error)}`);
  }
}

function formatEntryLine(e: PersistedOutputEntry): string {
  const originLabel = describeOrigin(e.origin);
  const statusColor =
    e.status === 'success' || e.status === 'no-issues'
      ? chalk.green
      : e.status === 'failure'
        ? chalk.red
        : chalk.yellow;
  return (
    `  - ${e.completedAt}  ${statusColor(e.status.padEnd(10))}  ` +
    `findings=${String(e.findings).padStart(3)}  origin=${originLabel}` +
    (e.prUrl ? `  PR=${e.prUrl}` : '')
  );
}

function describeOrigin(origin: PersistedOutputEntry['origin']): string {
  if (!origin) return '—';
  if (typeof origin === 'string') return origin;
  if (origin.kind === 'api') return `api:${origin.tokenName}`;
  if (origin.kind === 'chain') return `chain:${origin.upstreamTaskId}`;
  return '—';
}
