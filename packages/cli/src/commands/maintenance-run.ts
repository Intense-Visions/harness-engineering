// packages/cli/src/commands/maintenance-run.ts
//
// On-demand maintenance pipeline (Phase 3) — the `harness maintenance run`
// engine. Builds an infra-free TaskRunner (no orchestrator/gateway/ClaimManager),
// selects overdue/named/all sweep-eligible tasks via `selectTasks`, runs them in
// report mode (parallel) or fix mode (sequential), writes a consolidated
// `.harness/maintenance/last-run-summary.json`, and returns CI-friendly exit
// codes. See ADR 0050 (report-first on-demand) and the spec's Decisions D2/D4.

import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  TaskRunner,
  TaskOutputStore,
  MaintenanceReporter,
  CheckScriptRunner,
  type CheckCommandRunner,
  type AgentDispatcher,
  type CommandExecutor,
  type RunResult,
  type RunMode,
  type TaskDefinition,
  type TaskSelectionFilter,
} from '@harness-engineering/orchestrator';
import type { MaintenanceConfig } from '@harness-engineering/types';

const execFileAsync = promisify(execFile);

/** Real check runner — pure child_process, no orchestrator infra. Mirrors
 * Orchestrator.createMaintenanceTaskRunner's checkRunner (orchestrator.ts:662). */
function createCheckRunner(): CheckCommandRunner {
  return {
    run: async (command, cwd) => {
      const [cmd, ...args] = command;
      if (!cmd) return { passed: true, findings: 0, output: '' };
      try {
        const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 120_000 });
        const m = stdout.match(/(\d+)\s+(?:finding|issue|violation|error)/i);
        const findings = m ? parseInt(m[1]!, 10) : 0;
        return { passed: findings === 0, findings, output: stdout };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
        const m = output.match(/(\d+)\s+(?:finding|issue|violation|error)/i);
        return { passed: false, findings: m ? parseInt(m[1]!, 10) : 1, output };
      }
    },
  };
}

function createCommandExecutor(): CommandExecutor {
  return {
    exec: async (command, cwd) => {
      const [cmd, ...args] = command;
      if (!cmd) return { stdout: '' };
      const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 120_000 });
      return { stdout: String(stdout) };
    },
  };
}

/** Report-mode dispatcher: must never be called (report takes the no-dispatch
 * branch). Throws to make any accidental invocation loud in tests. */
function reportDispatcher(): AgentDispatcher {
  return {
    dispatch: async () => {
      throw new Error('report mode must not dispatch agents');
    },
  };
}

/** Fix-mode dispatcher: parity with the orchestrator's STUB (orchestrator.ts:686).
 * Real fix-agent dispatch does not exist anywhere in the repo yet (D-P3-1). */
function fixStubDispatcher(): AgentDispatcher {
  return { dispatch: async () => ({ producedCommits: false, fixed: 0 }) };
}

/** Construct a TaskRunner with no orchestrator/gateway/ClaimManager.
 * No prManager is wired in either mode → no git mutation, no PRs (D-P3-1). */
export function buildTaskRunner(cwd: string, config: MaintenanceConfig, mode: RunMode): TaskRunner {
  const outputStore = new TaskOutputStore({
    rootDir: path.join(cwd, '.harness', 'maintenance'),
  });
  return new TaskRunner({
    config,
    checkRunner: createCheckRunner(),
    commandExecutor: createCommandExecutor(),
    agentDispatcher: mode === 'report' ? reportDispatcher() : fixStubDispatcher(),
    cwd,
    checkScriptRunner: new CheckScriptRunner(cwd),
    outputStore,
    // prManager intentionally omitted; contextResolver omitted (composePromptContext returns '').
  });
}

/** Read maintenance run history (RunResult[]) via MaintenanceReporter — the
 * same on-disk history.json the cron scheduler writes. */
export async function loadRunHistory(cwd: string): Promise<RunResult[]> {
  const reporter = new MaintenanceReporter({
    persistDir: path.join(cwd, '.harness', 'maintenance'),
  });
  await reporter.load();
  return reporter.getHistory(500, 0);
}

// ---------------------------------------------------------------------------
// Pure selection / exit-code / aggregation helpers (no I/O). Unit-tested with
// in-memory fixtures; `now` is injected so selection stays deterministic.
// ---------------------------------------------------------------------------

/** Flags/positional from commander for the `run` subcommand. `only`/`skip` are
 * comma-separated id lists; `concurrency` is a raw string (validated here). */
export interface RunOptions {
  all?: boolean;
  only?: string;
  skip?: string;
  fix?: boolean;
  concurrency?: string;
  json?: boolean;
  positional?: string[];
}

export interface SelectionResult {
  filter: TaskSelectionFilter;
  skipIds: Set<string>;
  /** Fatal user errors → exit 2 (unknown/excluded id, bad flags, --all+ids). */
  errors: string[];
  /** Non-fatal warnings (e.g. unknown --skip id) → logged, exit unaffected. */
  warnings: string[];
}

function parseIdList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve flags + positional ids into a `selectTasks` filter, validating
 * requested ids against the resolved task set (D-P3-3): an unknown or
 * known-but-excluded requested id is a fatal error (exit 2); an unknown
 * `--skip` id is a harmless warning. `--all` combined with ids is an error.
 */
export function resolveSelection(
  opts: RunOptions,
  tasks: TaskDefinition[],
  now: Date = new Date()
): SelectionResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const requestedIds = [...(opts.positional ?? []), ...parseIdList(opts.only)];

  if (opts.all && requestedIds.length > 0) {
    errors.push('cannot combine --all with task ids/--only');
  }

  for (const id of requestedIds) {
    const t = byId.get(id);
    if (!t) {
      errors.push(`unknown task id '${id}'`);
    } else if (t.excludeFromHumanSweep === true) {
      errors.push(`task '${id}' is excluded from the human sweep and cannot be run on demand`);
    }
  }

  if (opts.concurrency !== undefined && opts.concurrency !== '') {
    const n = Number(opts.concurrency);
    if (!Number.isInteger(n) || n < 1) {
      errors.push(`invalid --concurrency '${opts.concurrency}' (must be a positive integer)`);
    }
  }

  const skipIds = new Set<string>();
  for (const id of parseIdList(opts.skip)) {
    if (!byId.has(id)) {
      warnings.push(`--skip: unknown task id '${id}' (ignored)`);
    } else {
      skipIds.add(id);
    }
  }

  let filter: TaskSelectionFilter;
  if (requestedIds.length > 0) {
    filter = { mode: 'ids', ids: requestedIds, now };
  } else if (opts.all) {
    filter = { mode: 'all', now };
  } else {
    filter = { mode: 'overdue', now };
  }

  return { filter, skipIds, errors, warnings };
}

/** Parse `--concurrency`, defaulting to `min(cpus-2, 8)` (floor 1). Throws on
 * invalid input (resolveSelection validates first, so this is belt-and-braces). */
export function parseConcurrency(raw?: string): number {
  if (raw === undefined || raw === '') {
    return Math.max(1, Math.min(os.cpus().length - 2, 8));
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`invalid --concurrency '${raw}' (must be a positive integer)`);
  }
  return n;
}

/** Exit 1 iff at least one task failed to EXECUTE; findings are NOT failures. */
export function deriveExitCode(results: RunResult[]): 0 | 1 {
  return results.some((r) => r.status === 'failure') ? 1 : 0;
}

export interface ReportRow {
  taskId: string;
  status: RunResult['status'];
  findings: number;
  fixed: number;
  prUrl: string | null;
  summary: string;
  error?: string;
}

export interface ConsolidatedReport {
  generatedAt: string;
  mode: RunMode;
  fix: boolean;
  exitCode: 0 | 1;
  tasks: ReportRow[];
  overdueNowCurrent: string[];
}

/** Build the consolidated report. Rows are sorted failures-first, then
 * findings-descending, then by id, so the most actionable rows surface at top. */
export function aggregateReport(args: {
  results: RunResult[];
  mode: RunMode;
  fix: boolean;
  exitCode: 0 | 1;
  overdueNowCurrent: string[];
  generatedAt: string;
}): ConsolidatedReport {
  const rows: ReportRow[] = args.results.map((r) => {
    const row: ReportRow = {
      taskId: r.taskId,
      status: r.status,
      findings: r.findings,
      fixed: r.fixed,
      prUrl: r.prUrl,
      summary: r.error ?? (r.findings > 0 ? `${r.findings} finding(s)` : 'clean'),
    };
    if (r.error !== undefined) row.error = r.error;
    return row;
  });
  rows.sort((a, b) => {
    const af = a.status === 'failure' ? 1 : 0;
    const bf = b.status === 'failure' ? 1 : 0;
    if (af !== bf) return bf - af;
    if (b.findings !== a.findings) return b.findings - a.findings;
    return a.taskId.localeCompare(b.taskId);
  });
  return {
    generatedAt: args.generatedAt,
    mode: args.mode,
    fix: args.fix,
    exitCode: args.exitCode,
    tasks: rows,
    overdueNowCurrent: args.overdueNowCurrent,
  };
}

/** Render the consolidated report as a `task | status | findings | summary`
 * console table with an "N overdue but now current" footer. */
export function renderTable(report: ConsolidatedReport): string {
  const header = ['TASK', 'STATUS', 'FINDINGS', 'SUMMARY'];
  const rows = report.tasks.map((r) => [r.taskId, r.status, String(r.findings), r.summary]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length), 0));
  const fmt = (cols: string[]): string => cols.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  const lines = [fmt(header), ...rows.map(fmt)];
  if (report.overdueNowCurrent.length > 0) {
    lines.push('');
    lines.push(
      `${report.overdueNowCurrent.length} overdue but now current: ${report.overdueNowCurrent.join(', ')}`
    );
  }
  return lines.join('\n');
}
