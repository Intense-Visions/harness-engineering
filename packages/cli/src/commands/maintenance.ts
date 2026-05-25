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
import * as fs from 'node:fs';
import chalk from 'chalk';
import {
  BUILT_IN_TASKS,
  TaskOutputStore,
  WorkflowLoader,
  type TaskDefinition,
} from '@harness-engineering/orchestrator';
import type { CustomTaskDefinition, MaintenanceConfig } from '@harness-engineering/types';
import type { PersistedOutputEntry } from '@harness-engineering/orchestrator';
import { ExitCode } from '../utils/errors';
import { logger } from '../output/logger';

async function loadMaintenanceConfig(cwd: string): Promise<MaintenanceConfig | null> {
  const workflowPath = path.join(cwd, 'harness.orchestrator.md');
  if (!fs.existsSync(workflowPath)) return null;
  const loader = new WorkflowLoader();
  const result = await loader.loadWorkflow(workflowPath);
  if (!result.ok) return null;
  // Spec B Phase 2 / S3: surface non-blocking routing warnings at startup.
  for (const w of result.value.warnings) logger.warn(w);
  return (result.value.config as { maintenance?: MaintenanceConfig }).maintenance ?? null;
}

function mergeResolvedTasks(config: MaintenanceConfig | null): TaskDefinition[] {
  const overrides = config?.tasks ?? {};
  const tasks: TaskDefinition[] = [];
  appendBuiltIns(tasks, overrides);
  appendCustomTasks(tasks, config?.customTasks ?? {}, overrides);
  return tasks;
}

function appendBuiltIns(
  tasks: TaskDefinition[],
  overrides: NonNullable<MaintenanceConfig['tasks']>
): void {
  for (const t of BUILT_IN_TASKS) {
    const ov = overrides[t.id];
    if (ov?.enabled === false) continue;
    const next: TaskDefinition = { ...t };
    if (ov?.schedule !== undefined) next.schedule = ov.schedule;
    tasks.push(next);
  }
}

function appendCustomTasks(
  tasks: TaskDefinition[],
  customs: Record<string, CustomTaskDefinition>,
  overrides: NonNullable<MaintenanceConfig['tasks']>
): void {
  for (const [id, def] of Object.entries(customs)) {
    const ov = overrides[id];
    if (ov?.enabled === false) continue;
    tasks.push(buildCustomTaskDefinition(id, def, ov?.schedule));
  }
}

function buildCustomTaskDefinition(
  id: string,
  def: CustomTaskDefinition,
  scheduleOverride: string | undefined
): TaskDefinition {
  const out: TaskDefinition = {
    id,
    type: def.type,
    description: def.description,
    schedule: scheduleOverride ?? def.schedule,
    branch: def.branch,
    isCustom: true,
  };
  copyOptional(def, out as unknown as Record<string, unknown>, [
    'checkCommand',
    'checkScript',
    'fixSkill',
    'inlineSkills',
    'inlineSkillsBudgetTokens',
    'contextFrom',
    'contextFromMaxAgeMinutes',
    'outputRetention',
    'costCeiling',
  ]);
  return out;
}

function copyOptional(
  src: Record<string, unknown> | object,
  dst: Record<string, unknown>,
  keys: string[]
): void {
  const s = src as Record<string, unknown>;
  for (const k of keys) {
    const v = s[k];
    if (v !== undefined) dst[k] = v;
  }
}

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
    'Hermes Phase 2 — inspect built-in + custom maintenance tasks and their persisted outputs'
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
