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
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  TaskRunner,
  TaskOutputStore,
  MaintenanceReporter,
  CheckScriptRunner,
  selectTasks,
  type CheckCommandRunner,
  type AgentDispatcher,
  type CommandExecutor,
  type RunResult,
  type RunMode,
  type TaskDefinition,
  type TaskSelectionFilter,
} from '@harness-engineering/orchestrator';
import type { MaintenanceConfig } from '@harness-engineering/types';
import { mapWithConcurrency } from '../utils/concurrency';
import { loadMaintenanceConfig, mergeResolvedTasks } from './maintenance-config';

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

// ---------------------------------------------------------------------------
// Orchestration: the pure runner the `.command('run').action` thin-wraps.
// All side-effecting collaborators are injectable so selection, exit codes,
// and aggregation are unit-tested with fakes (no real check execution).
// ---------------------------------------------------------------------------

/** Injectable collaborators (D-P3-5). Defaults wire the real, infra-free path. */
export interface MaintenanceRunDeps {
  /** Reference instant for overdue computation (default: wall clock). */
  now?: Date;
  loadTasks?: (cwd: string) => Promise<TaskDefinition[]>;
  loadHistory?: (cwd: string) => Promise<RunResult[]>;
  makeRunner?: (cwd: string, config: MaintenanceConfig, mode: RunMode) => TaskRunner;
  record?: (cwd: string, results: RunResult[]) => Promise<void>;
  /** stdout sink (table / --json). Default: console.log. */
  log?: (line: string) => void;
  /** stderr sink (warnings / errors). Default: console.error. Kept separate so
   * `--json` stdout stays a clean, parseable report. */
  logErr?: (line: string) => void;
}

export interface MaintenanceRunResult {
  exitCode: 0 | 1 | 2;
  report: ConsolidatedReport | null;
}

const STUB_FIX_WARNING =
  '--fix: AI fix-agent dispatch is not yet wired (executor dispatcher is a stub repo-wide); checks ran, no PRs were opened.';

async function defaultRecord(cwd: string, results: RunResult[]): Promise<void> {
  const reporter = new MaintenanceReporter({
    persistDir: path.join(cwd, '.harness', 'maintenance'),
  });
  await reporter.load();
  for (const r of results) await reporter.record(r);
}

function writeSummary(cwd: string, report: ConsolidatedReport): void {
  const dir = path.join(cwd, '.harness', 'maintenance');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'last-run-summary.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );
}

function syntheticFailure(taskId: string, message: string): RunResult {
  const ts = new Date().toISOString();
  return {
    taskId,
    startedAt: ts,
    completedAt: ts,
    status: 'failure',
    findings: 0,
    fixed: 0,
    prUrl: null,
    prUpdated: false,
    error: message,
  };
}

/**
 * Execute an on-demand maintenance sweep. Returns `{ exitCode, report }`; the
 * `.action()` wrapper translates `exitCode` into `process.exit`. Constructs no
 * orchestrator/gateway/ClaimManager — the report path is fully infra-free.
 */
export async function runMaintenanceRun(
  cwd: string,
  opts: RunOptions,
  deps: MaintenanceRunDeps = {}
): Promise<MaintenanceRunResult> {
  const now = deps.now ?? new Date();
  const log = deps.log ?? ((l: string) => console.log(l));
  const logErr = deps.logErr ?? ((l: string) => console.error(l));

  const config = await loadMaintenanceConfig(cwd);
  const loadTasks = deps.loadTasks ?? (async () => mergeResolvedTasks(config));
  const tasks = await loadTasks(cwd);

  const sel = resolveSelection(opts, tasks, now);
  for (const w of sel.warnings) logErr(w);
  if (sel.errors.length > 0) {
    for (const e of sel.errors) logErr(`error: ${e}`);
    return { exitCode: 2, report: null };
  }

  const mode: RunMode = opts.fix ? 'fix' : 'report';
  if (opts.fix) logErr(STUB_FIX_WARNING);

  const history = await (deps.loadHistory ?? loadRunHistory)(cwd);

  const overdueIds = new Set(
    selectTasks(tasks, history, { mode: 'overdue', now }).map((t) => t.id)
  );

  let selected = selectTasks(tasks, history, sel.filter);
  if (sel.skipIds.size > 0) selected = selected.filter((t) => !sel.skipIds.has(t.id));

  const selectedOverdue = new Set(selected.filter((t) => overdueIds.has(t.id)).map((t) => t.id));

  if (selected.length === 0) {
    log('All maintenance current.');
    const report = aggregateReport({
      results: [],
      mode,
      fix: Boolean(opts.fix),
      exitCode: 0,
      overdueNowCurrent: [],
      generatedAt: now.toISOString(),
    });
    writeSummary(cwd, report);
    return { exitCode: 0, report };
  }

  // Report checks parallelize under the cap; --fix forces sequential (D-P3-2).
  const concurrency = mode === 'fix' ? 1 : parseConcurrency(opts.concurrency);
  const runner = (deps.makeRunner ?? buildTaskRunner)(
    cwd,
    config ?? ({} as MaintenanceConfig),
    mode
  );

  const settled = await mapWithConcurrency(selected, concurrency, (t) =>
    runner.run(t, 'cli', mode)
  );
  const results: RunResult[] = settled.map((r, i) =>
    r instanceof Error ? syntheticFailure(selected[i]!.id, r.message) : r
  );

  await (deps.record ?? defaultRecord)(cwd, results);

  const overdueNowCurrent = results
    .filter(
      (r) => selectedOverdue.has(r.taskId) && (r.status === 'success' || r.status === 'no-issues')
    )
    .map((r) => r.taskId);

  const exitCode = deriveExitCode(results);
  const report = aggregateReport({
    results,
    mode,
    fix: Boolean(opts.fix),
    exitCode,
    overdueNowCurrent,
    generatedAt: now.toISOString(),
  });
  writeSummary(cwd, report);

  if (opts.json) log(JSON.stringify(report, null, 2));
  else log(renderTable(report));

  return { exitCode, report };
}
