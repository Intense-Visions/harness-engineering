import type { MaintenanceConfig } from '@harness-engineering/types';
import type { TaskDefinition, RunResult, RunOrigin, RunMode } from './types';
import type { CheckScriptRunner, CheckScriptResult } from './check-script-runner';
import type { ContextResolver } from './context-resolver';
import type { TaskOutputStore, PersistedOutputEntry } from './output-store';

/**
 * Interface for running CLI check commands in-process.
 * Each method returns a structured result with a findings count.
 */
export interface CheckCommandRunner {
  /**
   * Runs a check command and returns its structured output.
   * @param command - CLI command args (e.g., ['check-arch'])
   * @param cwd - Working directory
   * @returns Object with findings count and whether the check passed
   */
  run(command: string[], cwd: string): Promise<CheckCommandResult>;
}

export interface CheckCommandResult {
  passed: boolean;
  findings: number;
  /** Raw output for logging/reporting */
  output: string;
}

/**
 * Interface for dispatching an AI agent to fix issues.
 * Wraps AgentRunner.runSession() with maintenance-specific parameters.
 */
export interface AgentDispatcher {
  /**
   * Dispatch an AI agent to fix issues on a branch.
   * @param skill - Skill name to dispatch (e.g., 'harness-arch-fix')
   * @param branch - Branch to work on
   * @param backendName - Backend name to use (e.g., 'local', 'claude')
   * @param cwd - Working directory (worktree path)
   * @param options - Hermes Phase 2: optional `promptContext` prepended to
   *                  the agent's system prompt (inlined skills + upstream
   *                  outputs). The dispatcher MAY ignore this field on
   *                  backends that don't support context injection; the
   *                  TaskRunner persists it independently for observability.
   * @returns Whether the agent produced any commits
   */
  dispatch(
    skill: string,
    branch: string,
    backendName: string,
    cwd: string,
    options?: AgentDispatchOptions
  ): Promise<AgentDispatchResult>;
}

export interface AgentDispatchOptions {
  /** Hermes Phase 2 — prompt context (inlined skills + upstream outputs). */
  promptContext?: string;
}

export interface AgentDispatchResult {
  producedCommits: boolean;
  fixed: number;
}

/**
 * Interface for running housekeeping commands directly.
 */
export interface CommandExecutor {
  /**
   * Executes a command directly (no AI). Returns captured stdout so
   * housekeeping tasks emitting a JSON status line (e.g. `sync-main --json`)
   * can be parsed by the runner.
   *
   * @param command - Command args (e.g., ['cleanup-sessions'])
   * @param cwd - Working directory
   */
  exec(command: string[], cwd: string): Promise<CommandExecResult>;
}

export interface CommandExecResult {
  /** Captured stdout. May be empty for legacy housekeeping commands. */
  stdout: string;
}

/**
 * Interface for managing branches and PRs for maintenance tasks.
 * Matches PRManager's public API shape for DI.
 */
export interface PRLifecycleManager {
  ensureBranch(
    branchName: string,
    baseBranch: string
  ): Promise<{ created: boolean; recreated: boolean }>;
  ensurePR(
    task: TaskDefinition,
    runSummary: string
  ): Promise<{ prUrl: string; prUpdated: boolean }>;
}

export interface TaskRunnerOptions {
  config: MaintenanceConfig;
  checkRunner: CheckCommandRunner;
  agentDispatcher: AgentDispatcher;
  commandExecutor: CommandExecutor;
  /** Project root directory for running commands */
  cwd: string;
  /** Optional PR lifecycle manager for branch/PR operations */
  prManager?: PRLifecycleManager;
  /** Base branch for PR operations (defaults to 'main') */
  baseBranch?: string;
  /**
   * Hermes Phase 2 — Optional check-script runner. When a task declares
   * `checkScript`, the runner consults this instead of `checkRunner`.
   * Required for any custom task that uses `checkScript`; tests that don't
   * exercise custom tasks may omit it.
   */
  checkScriptRunner?: CheckScriptRunner;
  /**
   * Hermes Phase 2 — Optional context resolver providing `contextFrom`
   * upstream injection and `inlineSkills` payload assembly.
   */
  contextResolver?: ContextResolver;
  /**
   * Hermes Phase 2 — Persists per-task outputs (stdout / structured /
   * resolved context) at the end of each run.
   */
  outputStore?: TaskOutputStore;
}

/**
 * TaskRunner executes a single maintenance task based on its type.
 *
 * Execution paths:
 * - mechanical-ai: run check -> if findings, dispatch AI agent
 * - pure-ai: always dispatch AI agent
 * - report-only: run check, record findings, no AI
 * - housekeeping: run command directly, no AI
 */
export class TaskRunner {
  private config: MaintenanceConfig;
  private checkRunner: CheckCommandRunner;
  private agentDispatcher: AgentDispatcher;
  private commandExecutor: CommandExecutor;
  private cwd: string;
  private prManager: PRLifecycleManager | null;
  private baseBranch: string;
  private checkScriptRunner: CheckScriptRunner | null;
  private contextResolver: ContextResolver | null;
  private outputStore: TaskOutputStore | null;

  constructor(options: TaskRunnerOptions) {
    this.config = options.config;
    this.checkRunner = options.checkRunner;
    this.agentDispatcher = options.agentDispatcher;
    this.commandExecutor = options.commandExecutor;
    this.cwd = options.cwd;
    this.prManager = options.prManager ?? null;
    this.baseBranch = options.baseBranch ?? 'main';
    this.checkScriptRunner = options.checkScriptRunner ?? null;
    this.contextResolver = options.contextResolver ?? null;
    this.outputStore = options.outputStore ?? null;
  }

  /**
   * Run a maintenance task and return the result.
   * Dispatches to the appropriate execution path based on task type.
   * Never throws -- errors are captured in the RunResult.
   *
   * @param task - Resolved task definition.
   * @param origin - Hermes Phase 2 trigger-source tag; defaults to `'cron'`
   *                 when called from the scheduler path.
   */
  async run(
    task: TaskDefinition,
    origin: RunOrigin = 'cron',
    mode: RunMode = 'fix'
  ): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    let result: RunResult;
    let captured: CapturedCheck | undefined;
    try {
      switch (task.type) {
        case 'mechanical-ai': {
          const out = await this.runMechanicalAI(task, startedAt, mode);
          result = out.result;
          captured = out.captured;
          break;
        }
        case 'pure-ai':
          result = await this.runPureAI(task, startedAt, mode);
          break;
        case 'report-only': {
          const out = await this.runReportOnly(task, startedAt);
          result = out.result;
          captured = out.captured;
          break;
        }
        case 'housekeeping': {
          const out = await this.runHousekeeping(task, startedAt);
          result = out.result;
          captured = out.captured;
          break;
        }
        default: {
          const _exhaustive: never = task.type;
          result = this.failureResult(
            task.id,
            startedAt,
            `Unknown task type: ${String(_exhaustive)}`
          );
        }
      }
    } catch (err) {
      result = this.failureResult(task.id, startedAt, String(err));
    }

    result.origin = origin;
    await this.persistOutput(task, result, captured, origin);
    return result;
  }

  private async persistOutput(
    task: TaskDefinition,
    result: RunResult,
    captured: CapturedCheck | undefined,
    origin: RunOrigin
  ): Promise<void> {
    if (!this.outputStore) return;
    const entry: PersistedOutputEntry = {
      taskId: result.taskId,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      status: result.status,
      findings: result.findings,
      fixed: result.fixed,
      prUrl: result.prUrl,
      prUpdated: result.prUpdated,
      origin,
      ...(result.error !== undefined && { error: result.error }),
      ...(result.costUsd !== undefined && { costUsd: result.costUsd }),
      ...(captured?.stdout !== undefined && { stdout: captured.stdout }),
      ...(captured?.stderr !== undefined && { stderr: captured.stderr }),
      ...(captured?.structured !== undefined && { structured: captured.structured }),
      ...(captured?.context !== undefined && { context: captured.context }),
    };
    try {
      await this.outputStore.write(task.id, entry, task.outputRetention);
    } catch {
      // best-effort — failures already logged by the store
    }
  }

  /**
   * Run the check step using whichever runner the task asks for. Custom
   * tasks that declare `checkScript` go through the Hermes Phase 2
   * `CheckScriptRunner`; built-ins (and customs that use the legacy
   * `checkCommand` shape) go through the original heuristic runner.
   */
  private async runCheckStep(task: TaskDefinition): Promise<CheckOutcome> {
    if (task.checkScript) {
      if (!this.checkScriptRunner) {
        throw new Error(
          `task '${task.id}' declares checkScript but no CheckScriptRunner is configured`
        );
      }
      const r = (await this.checkScriptRunner.run(task.checkScript, this.cwd)) as CheckScriptResult;
      return {
        passed: r.passed,
        findings: r.findings,
        stdout: r.output,
        stderr: r.stderr,
        structured: r.structured ? (r.structured as unknown as Record<string, unknown>) : null,
      };
    }
    if (!task.checkCommand || task.checkCommand.length === 0) {
      throw new Error(`task '${task.id}' is missing checkCommand`);
    }
    const r = await this.checkRunner.run(task.checkCommand, this.cwd);
    return {
      passed: r.passed,
      findings: r.findings,
      stdout: r.output,
      stderr: '',
      structured: null,
    };
  }

  /**
   * Hermes Phase 2 — Compose the agent prompt-context block from inlined
   * skills + upstream task outputs. Returns an empty string when nothing
   * is configured (or when the resolver is absent), which is the safe
   * no-op default.
   */
  private async composePromptContext(task: TaskDefinition): Promise<string> {
    if (!this.contextResolver) return '';
    const skills = await this.contextResolver.resolveInlineSkills(
      task.inlineSkills,
      task.inlineSkillsBudgetTokens ?? 8000
    );
    const upstream = await this.contextResolver.resolveContextFrom(task.contextFrom, {
      maxAgeMinutes: task.contextFromMaxAgeMinutes ?? 1440,
    });
    return [skills, upstream].filter(Boolean).join('\n');
  }

  /**
   * Mechanical-AI: run check (legacy or Phase 2 script), dispatch AI agent
   * only if fixable findings exist; persist captured stdout/stderr/context
   * via the output store on the way out.
   */
  private async runMechanicalAI(
    task: TaskDefinition,
    startedAt: string,
    mode: RunMode = 'fix'
  ): Promise<RunOutcome> {
    if (!task.fixSkill) {
      return wrap(this.failureResult(task.id, startedAt, 'mechanical-ai task missing fixSkill'));
    }
    if (!task.branch) {
      return wrap(this.failureResult(task.id, startedAt, 'mechanical-ai task missing branch'));
    }
    if (!task.checkCommand && !task.checkScript) {
      return wrap(
        this.failureResult(
          task.id,
          startedAt,
          'mechanical-ai task missing checkCommand or checkScript'
        )
      );
    }

    let check: CheckOutcome;
    try {
      check = await this.runCheckStep(task);
    } catch (err) {
      return wrap(this.failureResult(task.id, startedAt, String(err)));
    }

    const promptContext = await this.composePromptContext(task);
    const baseCaptured: CapturedCheck = {
      stdout: check.stdout,
      stderr: check.stderr,
      structured: check.structured,
      ...(promptContext ? { context: promptContext } : {}),
    };

    // Skip dispatch when no fixable issues found. Hermes Phase 2: a
    // custom `checkScript` may also signal "record findings but don't
    // wake the agent" via the structured envelope (`{status: 'findings',
    // wakeAgent: false}` → CheckScriptRunner emits `passed: true`).
    const wakeAgentExplicitlyFalse =
      check.structured !== null &&
      typeof check.structured === 'object' &&
      (check.structured as { wakeAgent?: unknown }).wakeAgent === false;
    if (check.findings === 0 || wakeAgentExplicitlyFalse || mode === 'report') {
      // Report-mode status is aligned with the sibling `runReportOnly`
      // convention rather than reusing 'no-issues': a report sweep that ran
      // the check and surfaced N findings did real, successful work and must
      // NOT claim 'no-issues' while carrying `findings: N` (that disagrees with
      // runReportOnly's `status: 'success'` + real count for the same "ran a
      // check, found N, did not fix" semantics, and would mislead the Phase 3
      // CLI). Chosen over a new RunResult discriminator because it is the
      // minimal change — zero type/consumer churn — and reuses the existing
      // report-only contract Phase 3 already reads. Only a genuine zero-findings
      // report reports 'no-issues'. Fix-mode no-issues paths (findings === 0 or
      // wakeAgent:false) keep returning 'no-issues' unchanged.
      const reportedWithFindings = mode === 'report' && check.findings > 0;
      return {
        result: {
          taskId: task.id,
          startedAt,
          completedAt: new Date().toISOString(),
          status: reportedWithFindings ? 'success' : 'no-issues',
          findings: check.findings,
          fixed: 0,
          prUrl: null,
          prUpdated: false,
        },
        captured: baseCaptured,
      };
    }

    if (this.prManager) {
      try {
        await this.prManager.ensureBranch(task.branch, this.baseBranch);
      } catch (err) {
        return wrap(
          this.failureResult(task.id, startedAt, `ensureBranch failed: ${String(err)}`),
          baseCaptured
        );
      }
    }

    const backendName = this.resolveBackend(task.id);

    let agentResult;
    try {
      agentResult = promptContext
        ? await this.agentDispatcher.dispatch(task.fixSkill, task.branch, backendName, this.cwd, {
            promptContext,
          })
        : await this.agentDispatcher.dispatch(task.fixSkill, task.branch, backendName, this.cwd);
    } catch (err) {
      return {
        result: {
          taskId: task.id,
          startedAt,
          completedAt: new Date().toISOString(),
          status: 'failure',
          findings: check.findings,
          fixed: 0,
          prUrl: null,
          prUpdated: false,
          error: `Agent dispatch failed: ${String(err)}`,
        },
        captured: baseCaptured,
      };
    }

    let prUrl: string | null = null;
    let prUpdated = false;
    if (this.prManager && agentResult.producedCommits) {
      try {
        const summary = `Findings: ${check.findings}, Fixed: ${agentResult.fixed}`;
        const prResult = await this.prManager.ensurePR(task, summary);
        prUrl = prResult.prUrl;
        prUpdated = prResult.prUpdated;
      } catch (err) {
        // PR creation failed but agent work is preserved on branch
        console.warn(`[maintenance] PR creation failed for task ${task.id}: ${String(err)}`);
      }
    }

    return {
      result: {
        taskId: task.id,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'success',
        findings: check.findings,
        fixed: agentResult.fixed,
        prUrl,
        prUpdated,
      },
      captured: baseCaptured,
    };
  }

  /**
   * Pure-AI: always dispatch agent with configured skill.
   */
  private async runPureAI(
    task: TaskDefinition,
    startedAt: string,
    mode: RunMode = 'fix'
  ): Promise<RunResult> {
    if (mode === 'report') {
      // Report mode: pure-ai has no check step and never dispatches.
      return {
        taskId: task.id,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'no-issues',
        findings: 0,
        fixed: 0,
        prUrl: null,
        prUpdated: false,
      };
    }
    if (!task.fixSkill) {
      return this.failureResult(task.id, startedAt, 'pure-ai task missing fixSkill');
    }
    if (!task.branch) {
      return this.failureResult(task.id, startedAt, 'pure-ai task missing branch');
    }

    if (this.prManager) {
      try {
        await this.prManager.ensureBranch(task.branch, this.baseBranch);
      } catch (err) {
        return this.failureResult(task.id, startedAt, `ensureBranch failed: ${String(err)}`);
      }
    }

    const promptContext = await this.composePromptContext(task);
    const backendName = this.resolveBackend(task.id);
    let agentResult;
    try {
      agentResult = promptContext
        ? await this.agentDispatcher.dispatch(task.fixSkill, task.branch, backendName, this.cwd, {
            promptContext,
          })
        : await this.agentDispatcher.dispatch(task.fixSkill, task.branch, backendName, this.cwd);
    } catch (err) {
      return this.failureResult(task.id, startedAt, `Agent dispatch failed: ${String(err)}`);
    }

    let prUrl: string | null = null;
    let prUpdated = false;
    if (this.prManager && agentResult.producedCommits) {
      try {
        const summary = `Fixed: ${agentResult.fixed}`;
        const prResult = await this.prManager.ensurePR(task, summary);
        prUrl = prResult.prUrl;
        prUpdated = prResult.prUpdated;
      } catch (err) {
        // PR creation failed but agent work is preserved on branch
        console.warn(`[maintenance] PR creation failed for task ${task.id}: ${String(err)}`);
      }
    }

    return {
      taskId: task.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status: agentResult.producedCommits ? 'success' : 'no-issues',
      findings: 0,
      fixed: agentResult.fixed,
      prUrl,
      prUpdated,
    };
  }

  /**
   * Report-only: run check (legacy or Phase 2 script), record metrics, no AI dispatch.
   *
   * Honors the JSON status contract emitted by Phase 4/5 CLIs (`harness pulse run`
   * and `harness compound scan-candidates` in `--non-interactive` mode):
   *   {"status":"success"|"skipped"|"failure"|"no-issues",
   *    "candidatesFound"?: number, "error"?: string, "reason"?: string}
   *
   * Legacy report-only tasks emit free-form output and fall through to 'success'.
   */
  private async runReportOnly(task: TaskDefinition, startedAt: string): Promise<RunOutcome> {
    if (!task.checkCommand && !task.checkScript) {
      return wrap(
        this.failureResult(
          task.id,
          startedAt,
          'report-only task missing checkCommand or checkScript'
        )
      );
    }

    let check: CheckOutcome;
    try {
      check = await this.runCheckStep(task);
    } catch (err) {
      return wrap(this.failureResult(task.id, startedAt, String(err)));
    }
    const parsed = parseStatusLine(check.stdout);

    const status: RunResult['status'] = parsed?.status ?? 'success';
    // Findings precedence:
    //   - If a CLI emitted a JSON status line, the contract is that
    //     `candidatesFound` is the authoritative finding count for that run.
    //     If the field is omitted, the count is 0 (the new contract is
    //     "if you emit JSON, you must include candidatesFound or accept 0").
    //     This avoids surfacing false counts on dashboard rows when
    //     CheckCommandRunner heuristically extracts a number.
    //   - Legacy report-only tasks (no JSON status line) keep the prior
    //     behavior of falling back to `checkResult.findings`.
    const findings =
      parsed === null
        ? check.findings
        : typeof parsed.candidatesFound === 'number'
          ? parsed.candidatesFound
          : 0;

    const result: RunResult = {
      taskId: task.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status,
      findings,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
    };
    if (parsed?.error) {
      result.error = parsed.error;
    }
    return {
      result,
      captured: { stdout: check.stdout, stderr: check.stderr, structured: check.structured },
    };
  }

  /**
   * Housekeeping: run command directly, no AI, no PR.
   *
   * Captures stdout and parses a trailing JSON status line if present.
   * Recognized contracts:
   *   - Phase 4/5 status contract (e.g., harness pulse run): success/skipped/failure/no-issues
   *   - sync-main contract: updated/no-op/skipped/error → mapped onto the run-result status
   * Legacy housekeeping commands that emit no JSON keep the prior behavior:
   *   status: 'success', findings: 0.
   *
   * Hermes Phase 2: a `checkScript` may replace `checkCommand` for housekeeping
   * tasks; the runner falls through to the same JSON-status parsing path.
   */
  private async runHousekeeping(task: TaskDefinition, startedAt: string): Promise<RunOutcome> {
    if (!task.checkCommand && !task.checkScript) {
      return wrap(
        this.failureResult(
          task.id,
          startedAt,
          'housekeeping task missing checkCommand or checkScript'
        )
      );
    }

    let stdout: string;
    let stderr = '';
    let structured: Record<string, unknown> | null = null;
    if (task.checkScript) {
      try {
        const r = await this.runCheckStep(task);
        stdout = r.stdout;
        stderr = r.stderr;
        structured = r.structured;
      } catch (err) {
        return wrap(this.failureResult(task.id, startedAt, String(err)));
      }
    } else {
      try {
        const out = await this.commandExecutor.exec(task.checkCommand!, this.cwd);
        stdout = out.stdout ?? '';
      } catch (err) {
        return wrap(this.failureResult(task.id, startedAt, String(err)));
      }
    }

    const parsed = parseStatusLine(stdout);
    const status: RunResult['status'] = parsed?.status ?? 'success';
    const result: RunResult = {
      taskId: task.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status,
      findings: 0,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
    };
    if (parsed?.error) result.error = parsed.error;
    return { result, captured: { stdout, stderr, structured } };
  }

  /**
   * Resolve which AI backend name to use for a given task.
   * Priority: per-task override > global config > 'local' default.
   */
  private resolveBackend(taskId: string): string {
    const taskOverride = this.config.tasks?.[taskId]?.aiBackend;
    if (taskOverride) return taskOverride;
    return this.config.aiBackend ?? 'local';
  }

  private failureResult(taskId: string, startedAt: string, error: string): RunResult {
    return {
      taskId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'failure',
      findings: 0,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
      error,
    };
  }
}

/**
 * Hermes Phase 2 — Captured check-step artifacts the runner persists into the
 * output store. Subset of `PersistedOutputEntry` covering what the check
 * step produces; the runner merges this with the final `RunResult` shape.
 */
interface CapturedCheck {
  stdout?: string;
  stderr?: string;
  structured?: Record<string, unknown> | null;
  context?: string;
}

/**
 * Hermes Phase 2 — A normalized check-step outcome consumed by the
 * mechanical-ai / report-only / housekeeping paths regardless of whether
 * the source was `checkCommand` or `checkScript`.
 */
interface CheckOutcome {
  passed: boolean;
  findings: number;
  stdout: string;
  stderr: string;
  structured: Record<string, unknown> | null;
}

/**
 * Tuple wrapper the runner dispatch consumes (so failures and successes
 * share the same `{result, captured?}` shape).
 */
interface RunOutcome {
  result: RunResult;
  captured?: CapturedCheck;
}

function wrap(result: RunResult, captured?: CapturedCheck): RunOutcome {
  return captured ? { result, captured } : { result };
}

/**
 * Parse the last JSON-object line from a CLI's stdout. Returns `null` when no
 * line parses as JSON. The maintenance task-runner uses this to consume the
 * status contract emitted by `harness pulse run` and `harness compound scan-candidates`.
 *
 * Contract (Phase 4/5 CLIs):
 *   {"status":"success"|"skipped"|"failure"|"no-issues",
 *    "candidatesFound"?: number, "error"?: string, "reason"?: string}
 *
 * Tolerates trailing non-JSON lines (e.g., warning logs after the status JSON)
 * by scanning from the last line backward until a parseable JSON object with a
 * recognized `status` field is found.
 */
interface ParsedStatus {
  /** The maintenance run-result status this output maps to. */
  status: RunResult['status'];
  candidatesFound?: number;
  error?: string;
  reason?: string;
  /** Original raw status from the JSON line, preserved for error/skip messages. */
  rawStatus?: string;
}

function parseStatusLine(output: string): ParsedStatus | null {
  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || !line.startsWith('{') || !line.endsWith('}')) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const s = obj.status;
      // Phase 4/5 contract: 'success' | 'skipped' | 'failure' | 'no-issues'
      if (s === 'success' || s === 'skipped' || s === 'failure' || s === 'no-issues') {
        const parsed: ParsedStatus = { status: s, rawStatus: s };
        if (typeof obj.candidatesFound === 'number') {
          parsed.candidatesFound = obj.candidatesFound;
        }
        if (typeof obj.error === 'string') {
          parsed.error = obj.error;
        }
        if (typeof obj.reason === 'string') {
          parsed.reason = obj.reason;
        }
        if (typeof obj.detail === 'string' && !parsed.error) {
          // sync-main skipped shape: { status: 'skipped', reason, detail, defaultBranch }
          parsed.error = `${parsed.reason ?? 'skipped'}: ${obj.detail}`;
        }
        return parsed;
      }
      // sync-main contract: 'updated' | 'no-op' | 'skipped' | 'error'
      if (s === 'updated' || s === 'no-op') {
        return { status: 'success', rawStatus: s };
      }
      if (s === 'error') {
        const message = typeof obj.message === 'string' ? obj.message : 'unknown error';
        return { status: 'failure', error: message, rawStatus: 'error' };
      }
    } catch {
      // not JSON; keep scanning earlier lines
    }
  }
  return null;
}
