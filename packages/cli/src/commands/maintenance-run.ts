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
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  TaskRunner,
  TaskOutputStore,
  MaintenanceReporter,
  CheckScriptRunner,
  selectTasks,
  runHarnessCheck,
  createAgentDispatcher,
  createBackend,
  MAINTENANCE_CHECK_MAX_BUFFER,
  MAINTENANCE_CHECK_TIMEOUT_MS,
  type CheckCommandRunner,
  type AgentDispatcher,
  type CommandExecutor,
  type RunResult,
  type RunMode,
  type TaskDefinition,
  type TaskSelectionFilter,
} from '@harness-engineering/orchestrator';
import type { AgentBackend, BackendDef, MaintenanceConfig } from '@harness-engineering/types';
import { mapWithConcurrency } from '../utils/concurrency';
import { loadAgentBackends, loadMaintenanceConfig, mergeResolvedTasks } from './maintenance-config';
import { logger } from '../output/logger';

const execFileAsync = promisify(execFile);

/** Maintenance task → AI backend resolver. Mirrors the cron orchestrator's
 * `resolveBackend` (orchestrator.ts createMaintenanceTaskRunner): map a backend
 * NAME to a live {@link AgentBackend} via `createBackend`, or `null` when the
 * name is not in the loaded `agent.backends`. `null` makes the real dispatcher
 * no-op honestly instead of throwing. */
export type ResolveBackend = (backendName: string) => AgentBackend | null;

/** Build a {@link ResolveBackend} from a loaded `agent.backends` map. A `null`
 * or empty map yields a resolver that always returns `null` (nothing
 * configured) — the graceful-degradation case for a plain checkout. */
export function makeResolveBackend(backends: Record<string, BackendDef> | null): ResolveBackend {
  return (backendName: string) => {
    const def = backends?.[backendName];
    return def ? createBackend(def) : null;
  };
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

/** Real check runner — pure child_process, no orchestrator infra. Shares the
 * spawn/parse/timeout/executionFailed core (`runHarnessCheck`) with the cron
 * orchestrator (orchestrator.ts) so CLI and cron behave identically; the only
 * difference is how the checkCommand is resolved into a spawn invocation — here
 * via the harness entry script this CLI is running as.
 * @param harnessEntry entry script to invoke subcommands through (injectable). */
export function createCheckRunner(
  harnessEntry: string = defaultHarnessEntry()
): CheckCommandRunner {
  return {
    run: async (command, cwd) => {
      if (command.length === 0)
        return { passed: true, findings: 0, output: '', executionFailed: false };
      return runHarnessCheck(resolveHarnessSpawn(command, harnessEntry), cwd);
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
        timeout: MAINTENANCE_CHECK_TIMEOUT_MS,
        maxBuffer: MAINTENANCE_CHECK_MAX_BUFFER,
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

/** Real git seam for the fix dispatcher: `git <args>` in `cwd`, trimmed stdout.
 * Mirrors the orchestrator's seam (orchestrator.ts createMaintenanceTaskRunner). */
function realGit(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).toString().trim();
}

/**
 * Fix-mode dispatcher: the REAL maintenance agent dispatcher (#679), the same
 * one the cron orchestrator uses. Resolves the task's backend via
 * {@link ResolveBackend}, drives an AgentRunner session in the worktree, and
 * measures `fixed` by diffing git HEAD before/after.
 *
 * Graceful degradation is inherited from the dispatcher: when `resolveBackend`
 * returns `null` (no backend configured for that task) it logs a warning and
 * returns `{ producedCommits: false, fixed: 0 }` — it never throws and never
 * fabricates a result. There is NO prManager and NO PR: the agent commits to the
 * worktree directly, so `prUrl` stays null (we do not claim a PR).
 */
export function createFixDispatcher(
  resolveBackend: ResolveBackend,
  git: (args: string[], cwd: string) => string = realGit
): AgentDispatcher {
  return createAgentDispatcher({
    resolveBackend,
    git,
    logger: {
      info: (message: string) => logger.info(message),
      warn: (message: string) => logger.warn(message),
    },
  });
}

/** Construct a TaskRunner with no orchestrator/gateway/ClaimManager.
 * No prManager is wired in either mode → no PRs. In fix mode the agent
 * dispatches for real and commits to the worktree; `resolveBackend` maps each
 * task's backend name to a live backend (or `null` → honest no-op). */
export function buildTaskRunner(
  cwd: string,
  config: MaintenanceConfig,
  mode: RunMode,
  harnessEntry?: string,
  resolveBackend: ResolveBackend = () => null
): TaskRunner {
  const outputStore = new TaskOutputStore({
    rootDir: path.join(cwd, '.harness', 'maintenance'),
  });
  return new TaskRunner({
    config,
    checkRunner: createCheckRunner(harnessEntry),
    commandExecutor: createCommandExecutor(harnessEntry),
    agentDispatcher: mode === 'report' ? reportDispatcher() : createFixDispatcher(resolveBackend),
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
  /** Load the `agent.backends` map the `--fix` dispatcher resolves against
   *  (default: read `harness.orchestrator.md` via `loadAgentBackends`). Returns
   *  `null` when no backend is configured. Injectable so tests can supply a
   *  resolvable (mock) backend or assert the no-backend degradation path. */
  loadBackends?: (cwd: string) => Promise<Record<string, BackendDef> | null>;
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

/** Honest degradation notice emitted when `--fix` runs but no agent backend is
 * configured for the default maintenance backend. Dispatch is skipped (the real
 * dispatcher no-ops a null backend), so nothing was fixed — say so plainly
 * rather than implying a "stub" or pretending work happened. */
const NO_BACKEND_FIX_WARNING =
  '--fix: no agent backend configured for maintenance dispatch — dispatch was skipped and nothing was fixed. ' +
  'Configure agent.backends in harness.orchestrator.md (and maintenance.aiBackend), or run maintenance via the orchestrator.';

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

  // Wire the REAL fix dispatcher (#679): resolve `agent.backends` the same way
  // the cron orchestrator does. When the default maintenance backend cannot be
  // resolved (plain checkout, no agent.backends) we still build the dispatcher —
  // its null-backend branch no-ops honestly — but surface a clear notice so the
  // human knows nothing was dispatched. Report mode never touches backends.
  let resolveBackend: ResolveBackend = () => null;
  if (opts.fix) {
    const backends = await (deps.loadBackends ?? loadAgentBackends)(cwd);
    resolveBackend = makeResolveBackend(backends);
    const defaultBackendName = config?.aiBackend ?? 'local';
    const fixBackendConfigured = backends?.[defaultBackendName] !== undefined;
    if (!fixBackendConfigured) logErr(NO_BACKEND_FIX_WARNING);
  }

  const history = await (deps.loadHistory ?? loadRunHistory)(cwd);

  const overdueIds = new Set(
    selectTasks(tasks, history, { mode: 'overdue', now }).map((t) => t.id)
  );

  let selected = selectTasks(tasks, history, sel.filter);
  if (sel.skipIds.size > 0) selected = selected.filter((t) => !sel.skipIds.has(t.id));

  const selectedOverdue = new Set(selected.filter((t) => overdueIds.has(t.id)).map((t) => t.id));

  if (selected.length === 0) {
    const report = aggregateReport({
      results: [],
      mode,
      fix: Boolean(opts.fix),
      exitCode: 0,
      overdueNowCurrent: [],
      generatedAt: now.toISOString(),
    });
    writeSummary(cwd, report);
    // --json must ALWAYS emit a parseable ConsolidatedReport to stdout — even on
    // the common nothing-overdue happy path. Emitting the human sentinel here
    // would make `JSON.parse(stdout)` throw for any --json consumer. The plain
    // "All maintenance current." sentinel is for the NON-json path only.
    if (opts.json) log(JSON.stringify(report, null, 2));
    else log('All maintenance current.');
    return { exitCode: 0, report };
  }

  // Report checks parallelize under the cap; --fix forces sequential (D-P3-2).
  // If the user explicitly asked for parallelism (`--concurrency N`, N>1) under
  // --fix, that value is silently overridden — warn so the override is visible.
  if (mode === 'fix' && opts.concurrency !== undefined && opts.concurrency !== '') {
    const requested = Number(opts.concurrency);
    if (Number.isInteger(requested) && requested > 1) {
      logErr(
        `--concurrency ${requested} ignored: --fix runs sequentially (concurrency forced to 1 for fix-mode safety).`
      );
    }
  }
  const concurrency = mode === 'fix' ? 1 : parseConcurrency(opts.concurrency);
  const makeRunner =
    deps.makeRunner ??
    ((c: string, cfg: MaintenanceConfig, m: RunMode) =>
      buildTaskRunner(c, cfg, m, deps.harnessEntry, resolveBackend));
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
