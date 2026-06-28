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

const FINDINGS_RE = /(\d+)\s+(?:finding|issue|violation|error)/i;

/**
 * Generous stdout/stderr capture ceiling for spawned check subcommands. The
 * Node default (1 MB) is far too small for verbose checks — `harness cleanup`
 * on a large repo emits ~8 MB — and an exceeded buffer makes `execFile` reject
 * with EMPTY stdout/stderr, which the runner would otherwise misread as a
 * check that produced no output (a false execution failure). 64 MB leaves ample
 * headroom while still bounding memory.
 */
const CHECK_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Per-check wall-clock budget. Raised from the original 120 s because heavy
 * whole-repo checks legitimately need longer on large monorepos — `harness
 * cleanup` (all entropy types) takes ~165 s here — and a too-tight timeout
 * SIGTERMs the child, yielding empty output that the runner can only read as a
 * (false) execution failure. 300 s keeps a bound while letting real checks
 * finish. Shared with the cron orchestrator (orchestrator.ts) for parity.
 */
const CHECK_TIMEOUT_MS = 300_000;

/** Best-effort detection of a child killed by the `execFile` timeout (SIGTERM /
 * ETIMEDOUT / killed flag) so the runner can emit a diagnosable "timed out"
 * message instead of an empty, inscrutable failure. */
function isTimeoutError(e: {
  killed?: boolean;
  signal?: string | null;
  code?: string | number | null;
}): boolean {
  return e.killed === true || e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT';
}

/**
 * Resolve a maintenance `checkCommand` into a runnable child-process spawn.
 *
 * Built-in checkCommands are harness SUBCOMMAND argv (e.g. `['check-arch']`,
 * `['graph','scan']`); `main-sync` carries an explicit leading `'harness'`
 * literal. Either way the command must run THROUGH the harness binary — a bare
 * `check-arch` is not an executable on PATH and ENOENTs. We reuse the very
 * binary this CLI is executing as (`process.execPath` + this CLI's entry
 * script), so the subcommand actually runs and reports real numbers. The
 * leading `'harness'` literal is stripped to avoid double-prefixing.
 */
export function resolveHarnessSpawn(
  command: string[],
  harnessEntry: string
): { file: string; args: string[] } {
  const sub = command[0] === 'harness' ? command.slice(1) : command;
  return { file: process.execPath, args: [harnessEntry, ...sub] };
}

/** Resolve the harness entry script this CLI is running as (the bin the
 * subcommand checks should be invoked through). `process.argv[1]` is
 * `…/dist/bin/harness.js` under the real binary; tests inject a fake entry. */
function defaultHarnessEntry(): string {
  return process.argv[1] ?? '';
}

/** Real check runner — pure child_process, no orchestrator infra. Mirrors
 * Orchestrator.createMaintenanceTaskRunner's checkRunner (orchestrator.ts) but
 * resolves checkCommands through the harness binary so they actually execute.
 * @param harnessEntry entry script to invoke subcommands through (injectable). */
export function createCheckRunner(
  harnessEntry: string = defaultHarnessEntry()
): CheckCommandRunner {
  return {
    run: async (command, cwd) => {
      if (command.length === 0)
        return { passed: true, findings: 0, output: '', executionFailed: false };
      const { file, args } = resolveHarnessSpawn(command, harnessEntry);
      try {
        const { stdout } = await execFileAsync(file, args, {
          cwd,
          timeout: CHECK_TIMEOUT_MS,
          maxBuffer: CHECK_MAX_BUFFER,
        });
        // Parse-miss on a clean (exit 0) run defaults to 0 findings — a check
        // that ran and said nothing is clean, not "1 finding".
        const m = stdout.match(FINDINGS_RE);
        const findings = m ? parseInt(m[1]!, 10) : 0;
        return { passed: findings === 0, findings, output: stdout, executionFailed: false };
      } catch (err) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          killed?: boolean;
          signal?: string | null;
          code?: string | number | null;
        };
        let output = [e.stdout, e.stderr].filter(Boolean).join('\n');
        // A timeout SIGTERMs the child before it can flush — surface a clear,
        // diagnosable reason instead of an empty "failed to execute".
        if (!output.trim() && isTimeoutError(e)) {
          output = `check timed out after ${CHECK_TIMEOUT_MS}ms`;
        }
        const m = output.match(FINDINGS_RE);
        if (m) {
          // Non-zero exit WITH a parseable count: the check ran and found
          // issues (e.g. `check-arch` exits 1 with "45 issues"). Real finding.
          return { passed: false, findings: parseInt(m[1]!, 10), output, executionFailed: false };
        }
        // Non-zero exit / spawn error with NO parseable count: the check could
        // not produce a usable result (ENOENT, unknown subcommand, crash).
        // Flag executionFailed so the runner reports failure (ADR 0050) and
        // default findings to 0 — a broken check is not "1 finding".
        return { passed: false, findings: 0, output, executionFailed: true };
      }
    },
  };
}

/** Real housekeeping command executor — resolves harness subcommands through
 * the harness binary (parity with createCheckRunner / the orchestrator). */
export function createCommandExecutor(
  harnessEntry: string = defaultHarnessEntry()
): CommandExecutor {
  return {
    exec: async (command, cwd) => {
      if (command.length === 0) return { stdout: '' };
      const { file, args } = resolveHarnessSpawn(command, harnessEntry);
      const { stdout } = await execFileAsync(file, args, {
        cwd,
        timeout: CHECK_TIMEOUT_MS,
        maxBuffer: CHECK_MAX_BUFFER,
      });
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
export function buildTaskRunner(
  cwd: string,
  config: MaintenanceConfig,
  mode: RunMode,
  harnessEntry?: string
): TaskRunner {
  const outputStore = new TaskOutputStore({
    rootDir: path.join(cwd, '.harness', 'maintenance'),
  });
  return new TaskRunner({
    config,
    checkRunner: createCheckRunner(harnessEntry),
    commandExecutor: createCommandExecutor(harnessEntry),
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
  /** Harness entry script that checkCommand subcommands are invoked through.
   *  Defaults to the running CLI's own entry (`process.argv[1]`). Injectable so
   *  integration tests can point at a controlled fake harness binary. */
  harnessEntry?: string;
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
  const makeRunner =
    deps.makeRunner ??
    ((c: string, cfg: MaintenanceConfig, m: RunMode) =>
      buildTaskRunner(c, cfg, m, deps.harnessEntry));
  const runner = makeRunner(cwd, config ?? ({} as MaintenanceConfig), mode);

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
