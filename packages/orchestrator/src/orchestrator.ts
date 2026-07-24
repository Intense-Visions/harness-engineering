import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  WorkflowConfig,
  AgentBackend,
  RoutingRequest,
  RoutingDecision,
  RoutingPolicy,
  RoutingTelemetry,
  RoutingStatus,
  StageRun,
  WorkflowExecutionPlan,
  IntelligenceConfig,
} from '@harness-engineering/types';
import { RoutingError } from '@harness-engineering/types';
import type { Issue, IssueTrackerClient } from '@harness-engineering/core';
import { writeTaint, SecurityScanner } from '@harness-engineering/core';
import { hasIntroducedSecurityDefect, outcomeVerdictToQualityFail } from './agent/quality-verdict';
import {
  IntelligencePipeline,
  OutcomeEvaluator,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import type {
  EnrichedSpec,
  AnalysisProvider,
  TriagePrediction,
} from '@harness-engineering/intelligence';
import { runRetrospective, buildTriageOutcomeInput } from './agent/triage-outcome';
import { GraphStore } from '@harness-engineering/graph';
import type { OrchestratorState, LiveSession, RunningEntry } from './types/internal';
import type { OrchestratorEvent, SideEffect } from './types/events';
import { applyEvent } from './core/state-machine';
import { createEmptyState } from './core/state-helpers';
import { detectStalledIssues } from './core/stall-detector';
import { AnalysisArchive } from './core/analysis-archive';
import { IntelligencePipelineRunner } from './intelligence/pipeline-runner';
import { CompletionHandler } from './completion/handler';
import type { OrchestratorContext } from './types/orchestrator-context';
import {
  GitHubIssuesSyncAdapter,
  loadTrackerSyncConfig,
  createTrackerClient,
  eventSourcing,
  type TrackerClientConfig,
} from '@harness-engineering/core';
import { RoadmapTrackerAdapter } from './tracker/adapters/roadmap';
import { GitHubIssuesIssueTrackerAdapter } from './tracker/adapters/github-issues-issue-tracker';
import { WorkspaceManager } from './workspace/manager';
import { WorkspaceHooks } from './workspace/hooks';
import { AgentRunner } from './agent/runner';
import { PromptRenderer } from './prompt/renderer';
// Spec 2 SC30 / Task 11: backend class imports moved to
// `OrchestratorBackendFactory` + `createBackend` (factory module). The
// orchestrator no longer constructs backends directly — factory handles
// dispatch-time materialization.
import {
  LocalModelResolver,
  defaultWarmModel,
  defaultWarmModelViaCompletion,
} from './agent/local-model-resolver';
import {
  PoolStateStore,
  PoolManager,
  OllamaInstallAdapter,
  HardwareDetector,
  RefreshScheduler,
  runRefreshTick,
  createNativeRecommender,
  loadFrozenCandidates,
  selectCandidates,
  curationFromCandidates,
  probeToolCalling,
  createBuildQualityReRanker,
  HarnessFitCacheFileStore,
  DEFAULT_HARNESS_FIT_TASKS,
} from '@harness-engineering/local-models';
import type {
  PoolStateProvider,
  InstallAdapter,
  DedupPair,
  DedupPairs,
  HardwareProfile,
  SchedulerTimerHandle,
  FrozenCandidate,
  DiscoverCandidatesOptions,
  DiscoverCandidatesResult,
  HarnessFitProbeDeps,
  RankerCandidate,
  HarnessFitProbeTask,
} from '@harness-engineering/local-models';
import { HarnessFitProbeRunner } from './agent/harness-fit-runner';
import { createModelProposal, listProposals, updateProposal } from '@harness-engineering/core';
import { redriveInstallingProposals } from './proposals/model-handlers';
import type { ModelProposalRecord } from '@harness-engineering/types';
import { migrateAgentConfig } from './agent/config-migration';
import { OrchestratorBackendFactory } from './agent/orchestrator-backend-factory';
import { isLocalEndpointBackend, isLocalExecutionBackend } from './agent/backend-factory';
import { makeBackendResolver } from './agent/backend-resolver';
import { createAgentDispatcher } from './maintenance/agent-dispatcher';
import { execFileSync } from 'node:child_process';
import { buildIntelligencePipeline } from './agent/intelligence-factory';
import { toArray } from './agent/backend-router';
import { AdaptiveRouter } from './agent/adaptive-router';
import { RoutingDecisionBus } from './routing/decision-bus.js';
// Spec B Phase 3: detectScopeTier / artifactPresenceFromIssue moved to
// `./agent/use-case-builder` (the new caller). The dispatch site no
// longer references them directly.
import { discoverSkillCatalog, type SkillCatalogEntry } from './workflow/skill-catalog';
import { distillGateFailure } from './workflow/gate-feedback';
import {
  needsDoc,
  findUndocumentedAdditions,
  formatUndocumentedReason,
} from './workflow/doc-coverage-gate';
import { resolvePeerUnloadFromConfig } from './workflow/peer-unload';
import {
  shouldRequestUnstickAdvice,
  buildUnstickPrompt,
  formatUnstickAdvisory,
  UNSTICK_SCHEMA,
  UNSTICK_SYSTEM_PROMPT,
  DEFAULT_REASONER_ASSIST_AFTER,
  REASONER_UNSTICK_TIMEOUT_MS,
  type UnstickAdvice,
} from './workflow/unstick-advisory';
import { workflowFor } from './workflow/workflow-for';
import { buildWorkflowContext, documentStagePath } from './workflow/orchestrator-context';
import { executeWorkflow } from './workflow/execute-workflow';
import { buildRoutingUseCase } from './agent/use-case-builder';
import { applyAnalysisEnv } from './agent/analysis-env';
import { makeLiveClassify } from './agent/live-classify';
import { buildTaskText } from './agent/complexity-request';
import { buildAnalysisProviderForLayer } from './agent/intelligence-factory';
import { buildAnalysisProvider } from './agent/analysis-provider-factory';
import { OrchestratorServer } from './server/http';
import { WebhookStore } from './gateway/webhooks/store';
import { WebhookDelivery } from './gateway/webhooks/delivery';
import { WebhookQueue } from './gateway/webhooks/queue';
import { wireWebhookFanout } from './gateway/webhooks/events';
import { wireTelemetryFanout } from './gateway/telemetry/fanout';
import { SinkRegistry } from './notifications/registry';
import { wireNotificationSinks } from './notifications/events';
import { CacheMetricsRecorder, OTLPExporter } from '@harness-engineering/core';
import { StructuredLogger } from './logging/logger';
import { scanWorkspaceConfig } from './workspace/config-scanner';
import { InteractionQueue } from './core/interaction-queue';
import { computeRateLimitDelay } from './core/rate-limiter';
import type { EscalateEffect, ClaimEffect } from './types/events';
import {
  persistLane,
  readPersistedLanes,
  type OrchestratorLaneSignal,
  type PersistedLanes,
} from './core/lane-persistence';
import { ClaimManager } from './core/claim-manager';
import { PRDetector, type ExecFileFn } from './core/pr-detector';
import { MaintenanceScheduler } from './maintenance/scheduler';
import { SingleProcessLeaderElector } from './maintenance/leader-elector';
import { MaintenanceReporter } from './maintenance/reporter';
import { TaskRunner } from './maintenance/task-runner';
import { CheckScriptRunner } from './maintenance/check-script-runner';
import {
  runHarnessCheck,
  MAINTENANCE_CHECK_MAX_BUFFER,
  MAINTENANCE_CHECK_TIMEOUT_MS,
} from './maintenance/check-runner';
import { TaskOutputStore } from './maintenance/output-store';
import { ContextResolver, type InlineSkillReader } from './maintenance/context-resolver';
import { validateCustomTasks } from './maintenance/custom-task-validator';
import { BUILT_IN_TASKS } from './maintenance/task-registry';
import type {
  CheckCommandRunner,
  AgentDispatcher,
  CommandExecutor,
} from './maintenance/task-runner';
import { resolveOrchestratorId } from './core/orchestrator-identity';
import { StreamRecorder } from './core/stream-recorder';
import { FlightRecorder, gatherProvenance, type Verdict } from './core/flight-recorder';

/**
 * Resolve a `harnessFit.taskIds` override into the concrete probe task suite (D5
 * config→deps translation). Ids are matched against the shipped
 * {@link DEFAULT_HARNESS_FIT_TASKS}; unknown ids are dropped (advisory). An absent or
 * empty selection returns `undefined` so the scheduler falls back to the default suite.
 */
function resolveHarnessFitTasks(
  taskIds: readonly string[] | undefined
): readonly HarnessFitProbeTask[] | undefined {
  if (taskIds === undefined || taskIds.length === 0) return undefined;
  const byId = new Map(DEFAULT_HARNESS_FIT_TASKS.map((t) => [t.id, t]));
  const resolved = taskIds
    .map((id) => byId.get(id))
    .filter((t): t is HarnessFitProbeTask => t !== undefined);
  return resolved.length > 0 ? resolved : undefined;
}

/**
 * Derives the worktree seed paths from a workflow config when
 * {@link WorkspaceConfig.seedPaths} is not set explicitly.
 *
 * A new worktree is checked out from a committed remote ref and therefore lacks
 * the uncommitted artifacts of the brainstorm → orchestrator handoff. Seeding
 * carries them over: the proposal directory, plus the roadmap file at its
 * *configured* location — a roadmap tracker may point `filePath` somewhere
 * other than the default `docs/roadmap.md`, and the default seed list would
 * otherwise miss it.
 */
export function deriveSeedPaths(config: WorkflowConfig): string[] {
  const roadmapPath =
    config.tracker.kind === 'roadmap' && config.tracker.filePath
      ? config.tracker.filePath
      : 'docs/roadmap.md';
  return ['.harness/proposals', roadmapPath];
}

/**
 * Resolve a maintenance `checkCommand` (or housekeeping command) into a runnable
 * argv. Built-in maintenance task definitions store the command as harness
 * SUBCOMMAND argv (e.g. `['check-arch']`, `['graph','scan']`); `main-sync`
 * carries an explicit leading `'harness'` literal. Either way the command must
 * be executed through the `harness` binary, so:
 *   - `['check-arch']`           → `['harness', 'check-arch']`
 *   - `['harness','sync-main']`  → `['harness', 'sync-main']`  (no double-prefix)
 *   - `[]`                       → `[]`
 *
 * The cron daemon resolves `harness` from PATH (the pre-existing assumption that
 * `main-sync` already relied on).
 */
export function normalizeHarnessCommand(command: string[]): string[] {
  if (command.length === 0) return [];
  if (command[0] === 'harness') return command;
  return ['harness', ...command];
}

// Gate-failure feedback distillation lives in ./workflow/gate-feedback (kept out
// of this monolith for testability + the module-size arch gate). `truncateGateOutput`
// is re-exported to preserve the public symbol surface.
export { truncateGateOutput } from './workflow/gate-feedback';

/**
 * local-backend-full-workflow Phase 2 (Option C): the production default verify
 * runner for the local enforced gate. It runs the project's own mechanical gate
 * (typecheck + lint + test) over `workspacePath` via `pnpm -w run <script>` for
 * whichever of `typecheck`/`lint`/`test` the workspace's package.json declares,
 * short-circuiting on the first red gate. Adopter-portable: it only runs the
 * scripts that exist, and a missing package.json / no scripts → a passing gate
 * (nothing to check). Fully self-contained; tests inject a fake via the
 * `verifyRunner` seam so this concrete detector is never exercised in unit tests.
 */
export function changedWorkspacePackages(porcelain: string): string[] {
  const dirs = new Set<string>();
  for (const raw of porcelain.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line.length === 0) continue;
    // `git status --porcelain` lines are `XY <path>`; a rename is `R  old -> new`.
    let p = line.length > 3 ? line.slice(3) : line;
    const arrow = p.indexOf(' -> ');
    if (arrow !== -1) p = p.slice(arrow + 4);
    p = p.replace(/^"/, '').replace(/"$/, ''); // unquote paths with special chars
    const m = /^(packages\/[^/]+)\//.exec(p);
    if (m?.[1] !== undefined) dirs.add(m[1]);
  }
  return [...dirs];
}

/** Per-changed-package verify scripts, in order. Shared with {@link verifyChangedPackages}. */
const LOCAL_VERIFY_SCRIPTS = ['typecheck', 'lint', 'test'] as const;

/**
 * Verify each changed package's own build→typecheck→lint→test, scoped to the
 * package and short-circuiting on the first failure. Extracted from
 * {@link defaultLocalVerifyRunner} so the build-first ordering + short-circuit are
 * unit-testable via an injected `run` (production passes an execFile-backed pnpm
 * runner; tests pass a fake that records the command sequence).
 *
 * BUILD runs BEFORE lint/test: a package whose lint/test consume its OWN compiled
 * output — e.g. an eslint-plugin whose flat config dogfoods its built `dist`, or an
 * integration test importing the package entry — otherwise fails to resolve a
 * just-added source module ("Cannot find module './src/rules/…'") on a freshly
 * `pnpm install`ed-but-unbuilt worktree. That would block CORRECT code on a stale
 * dist rather than a real quality defect. `${name}...` builds the package and its
 * workspace deps. CI builds before lint/test; the local gate must match.
 */
export async function verifyChangedPackages(
  changedPkgs: readonly string[],
  readPkg: (dir: string) => { name?: string; scripts: Record<string, string> },
  run: (args: string[]) => Promise<{ ok: boolean; output: string }>
): Promise<{ ok: boolean; output: string }> {
  for (const dir of changedPkgs) {
    const { name, scripts } = readPkg(dir);
    if (name === undefined) continue;
    if (scripts['build'] !== undefined) {
      const built = await run(['--filter', `${name}...`, 'run', 'build']);
      if (!built.ok) return built;
    }
    for (const script of LOCAL_VERIFY_SCRIPTS) {
      if (scripts[script] === undefined) continue;
      const result = await run(['--filter', name, 'run', script]);
      if (!result.ok) return result;
    }
  }
  return { ok: true, output: '' };
}

export async function defaultLocalVerifyRunner(
  workspacePath: string
): Promise<{ ok: boolean; output: string }> {
  // Access via the module namespace objects (not destructured) — destructuring
  // `execFile`/`join`/`readFileSync` off a module trips the unbound-method lint.
  const cp = await import('node:child_process');
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');

  // Manual Promise wrapper around execFile (avoids promisify's overloaded typing).
  const run = (args: string[]): Promise<{ ok: boolean; output: string }> =>
    new Promise((resolve) => {
      // S2: bound each verify step (typecheck/lint/test) with the same wall-clock
      // limit as the acceptance command — a wedged or watch-mode script must not hang
      // the settle/tick forever. A timeout (Node sets `killed:true`) is a gate FAIL.
      cp.execFile(
        'pnpm',
        args,
        { cwd: workspacePath, maxBuffer: 32 * 1024 * 1024, timeout: LOCAL_GATE_TIMEOUT_MS },
        (error, stdout, stderr) => {
          if (error) {
            const timedOut = (error as { killed?: boolean }).killed === true;
            const suffix = timedOut ? ` (TIMED OUT after ${LOCAL_GATE_TIMEOUT_MS}ms)` : '';
            resolve({
              ok: false,
              output: `${args.join(' ')} failed${suffix}:\n${stdout ?? ''}\n${stderr ?? error.message}`,
            });
          } else {
            resolve({ ok: true, output: '' });
          }
        }
      );
    });

  const readPkg = (dir: string): { name?: string; scripts: Record<string, string> } => {
    try {
      const pkg = JSON.parse(
        fsMod.readFileSync(pathMod.join(workspacePath, dir, 'package.json'), 'utf8')
      ) as { name?: string; scripts?: Record<string, string> };
      return { ...(pkg.name !== undefined ? { name: pkg.name } : {}), scripts: pkg.scripts ?? {} };
    } catch {
      return { scripts: {} };
    }
  };

  const SCRIPTS = LOCAL_VERIFY_SCRIPTS;

  // SCOPE the gate to the packages the agent actually changed, not the whole
  // monorepo. Running `pnpm -w run test` (turbo over every package) for a one-file
  // local change is heavy, slow, and fragile — it fails on unrelated flaky tests
  // and requires every package's native deps to be built. Full-tree verification
  // belongs at PR/CI; the local gate verifies what changed. Fall back to the
  // workspace-root scripts only when the change is outside any package (root/docs).
  const porcelain = await new Promise<string>((resolve) => {
    cp.execFile(
      'git',
      ['-C', workspacePath, 'status', '--porcelain'],
      { maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => resolve(err ? '' : (stdout ?? ''))
    );
  });
  const changedPkgs = changedWorkspacePackages(porcelain);

  if (changedPkgs.length === 0) {
    // Root/docs-only change (or git unavailable): verify the root scripts so a
    // root change is still checked. `-w` runs the workspace-root aggregate.
    if (!fsMod.existsSync(pathMod.join(workspacePath, 'package.json'))) {
      return { ok: true, output: '' };
    }
    const { scripts } = readPkg('.');
    for (const script of SCRIPTS) {
      if (scripts[script] === undefined) continue;
      const result = await run(['-w', 'run', script]);
      if (!result.ok) return result;
    }
    return { ok: true, output: '' };
  }

  // Verify each changed package's own build→typecheck→lint→test, scoped and
  // short-circuiting. Delegated to the injectable helper so the build-first
  // ordering is unit-tested (verifyChangedPackages) without shelling out to pnpm.
  return verifyChangedPackages(changedPkgs, readPkg, run);
}

/**
 * local-backend-full-workflow (Blocker 2b): the production default diff runner
 * for the local enforced gate's empty-diff halt. Reports whether the agent
 * produced ANY change in the workspace by running `git status --porcelain` over
 * `workspacePath` and treating non-empty (trimmed) output as changes.
 *
 * Files neutralized via `git update-index --skip-worktree` (the workspace-scan
 * neutralization) correctly do NOT appear in `status --porcelain`, so they never
 * mask a truly-empty diff. Fully self-contained; tests inject a fake via the
 * `diffRunner` seam so this concrete detector is never exercised in unit tests.
 * On any git error it fail-OPEN (`hasChanges: true`) so a detection failure never
 * blocks a genuine change — the verify + outcome-eval stages remain the gate.
 */
export async function defaultLocalDiffRunner(
  workspacePath: string
): Promise<{ hasChanges: boolean }> {
  // Access via the module namespace object (not destructured) — destructuring
  // `execFile` off the module trips the unbound-method lint.
  const cp = await import('node:child_process');
  return new Promise((resolve) => {
    cp.execFile(
      'git',
      ['-C', workspacePath, 'status', '--porcelain'],
      { maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          // Fail-open: a git error must not spuriously block a real change.
          resolve({ hasChanges: true });
          return;
        }
        resolve({ hasChanges: stdout.trim().length > 0 });
      }
    );
  });
}

/**
 * Default doc-coverage runner: fail the gate when a newly-ADDED public source file in
 * the workspace is not referenced anywhere under `docs/` (see {@link findUndocumentedAdditions}).
 * Gathers added files via `git` and the docs corpus via a shallow read of `docs/**\/*.md`,
 * then defers the decision to the pure gate. Fail-OPEN on any IO error — a scan failure
 * must never block a genuine change (verify + outcome-eval remain the real gate).
 */
export async function defaultLocalDocCoverageRunner(
  workspacePath: string
): Promise<{ ok: boolean; output: string }> {
  const cp = await import('node:child_process');
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  try {
    const added: string[] = await new Promise((resolve) => {
      cp.execFile(
        'git',
        ['-C', workspacePath, 'diff', '--name-only', '--diff-filter=A', 'HEAD'],
        { maxBuffer: 32 * 1024 * 1024 },
        (error, stdout) => {
          // Include untracked files too — a fresh worktree may not have committed them.
          cp.execFile(
            'git',
            ['-C', workspacePath, 'ls-files', '--others', '--exclude-standard'],
            { maxBuffer: 32 * 1024 * 1024 },
            (error2, stdout2) => {
              const committed = error ? [] : stdout.split('\n').filter(Boolean);
              const untracked = error2 ? [] : stdout2.split('\n').filter(Boolean);
              resolve([...committed, ...untracked]);
            }
          );
        }
      );
    });
    const needsAny = added.filter((f) => needsDoc(f));
    if (needsAny.length === 0) return { ok: true, output: '' };

    // Read the docs corpus once (basename mentions across all docs markdown).
    const docsRoot = pathMod.join(workspacePath, 'docs');
    let docsText = '';
    const walk = (dir: string): void => {
      let entries: import('node:fs').Dirent[];
      try {
        entries = fsMod.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = pathMod.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.md')) {
          try {
            docsText += fsMod.readFileSync(full, 'utf8') + '\n';
          } catch {
            /* skip unreadable file */
          }
        }
      }
    };
    walk(docsRoot);

    const undocumented = findUndocumentedAdditions(needsAny, docsText);
    if (undocumented.length === 0) return { ok: true, output: '' };
    return { ok: false, output: formatUndocumentedReason(undocumented) };
  } catch {
    // Fail-open: a scan error must not spuriously block a real change.
    return { ok: true, output: '' };
  }
}

/**
 * staged-verify-gate-convergence (S2): the wall-clock bound applied to the local
 * settle gate's mechanical step (the acceptance command AND the verify runner). An
 * un-bounded gate command would hang `settleWorkflowSuccess` — and thus the entire
 * tick — indefinitely. 10 minutes is generous for a scoped typecheck+lint+test or a
 * declared acceptance command while still guaranteeing forward progress; a timeout
 * is treated as a gate FAIL (block → retry/escalate), never a silent pass.
 */
export const LOCAL_GATE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * staged-verify-gate-convergence D2: the production default acceptance runner. Runs
 * an operator-declared shell `command` in `workspacePath` and reports pass/fail from
 * its exit code (0 ⇒ ok). The command is config-driven (`StagedWorkflowDecl.acceptance`)
 * so NOTHING project-specific is baked in here. Mirrors the `verifyRunner` seam so
 * the settle gate is decoupled from the concrete spawner; tests inject a fake via the
 * `acceptanceRunner` seam so this concrete spawner is never exercised in unit tests.
 * A non-zero exit (or spawn error) is a FAIL — the acceptance command IS the gate, so
 * an un-runnable command must block (never silently pass), mirroring the verify floor.
 */
export async function defaultLocalAcceptanceRunner(
  workspacePath: string,
  command: string,
  // S2: overridable ONLY for tests (a small bound proves the timeout→FAIL path fast).
  // Production callers pass 2 args ⇒ the 10-minute default.
  timeoutMs: number = LOCAL_GATE_TIMEOUT_MS
): Promise<{ ok: boolean; output: string }> {
  // Access via the module namespace object (not destructured) — destructuring
  // `exec` off the module trips the unbound-method lint.
  const cp = await import('node:child_process');
  return new Promise((resolve) => {
    // S2: BOUND the acceptance command. Without a timeout an operator's hanging
    // command (e.g. a watch-mode `test` that never exits, or a wedged process)
    // would hang `settleWorkflowSuccess` FOREVER, stalling the whole tick. The
    // acceptance command IS the gate, so a timeout is a FAIL (Node kills the child
    // on `timeout` and surfaces an `error` with `killed:true`) — the gate blocks
    // and the unit retries/escalates rather than deadlocking.
    cp.exec(
      command,
      { cwd: workspacePath, maxBuffer: 32 * 1024 * 1024, timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          const timedOut = (error as { killed?: boolean }).killed === true;
          const prefix = timedOut
            ? `acceptance command TIMED OUT after ${timeoutMs}ms (${command})`
            : `acceptance command failed (${command})`;
          resolve({
            ok: false,
            output: `${prefix}:\n${stdout ?? ''}\n${stderr ?? error.message}`,
          });
        } else {
          resolve({ ok: true, output: '' });
        }
      }
    );
  });
}

/**
 * staged-verify-gate-convergence D3: default bound on consecutive staged-settle
 * gate failures before a local unit escalates to the needs-human terminal. A module
 * constant for now (config wiring deferred — see the proposal's `maxLocalStageRetries`
 * follow-up); the settle path reads `config.agent.routing?.maxLocalStageRetries` when
 * present, else this default.
 */
export const DEFAULT_MAX_LOCAL_STAGE_GATE_RETRIES = 5;

/**
 * The central orchestrator that manages the lifecycle of coding agents.
 *
 * It polls an issue tracker for candidate tasks, manages ephemeral workspaces,
 * runs agents to resolve issues, and updates the tracker with progress.
 *
 * @fires Orchestrator#state_change Emitted when the internal state machine transitions
 * @fires Orchestrator#agent_event Emitted when an agent produces an output or thought
 */
// Spec B Phase 3: the Phase-2-era `useCaseForBackendParam` has been
// replaced by `buildRoutingUseCase` (./agent/use-case-builder), which
// also consults the skill catalog so per-skill / per-mode routing
// fires at dispatch (F1/F2). The legacy local→quick-fix mapping is
// preserved inside the new helper.
export class Orchestrator extends EventEmitter {
  private state: OrchestratorState;
  private config: WorkflowConfig;
  private tracker: IssueTrackerClient;
  private workspace: WorkspaceManager;
  private hooks: WorkspaceHooks;
  /**
   * Identifiers this process has already provisioned a worktree for since
   * startup (D1). A re-dispatch of an identifier in this set is a within-run
   * retry → `ensureWorkspace` preserves the existing worktree (keeping the
   * agent's uncommitted partial progress). The set is per-process and reset
   * only by process lifetime, so after a restart it is empty and the first
   * dispatch of any leftover worktree wipes it — anti-stale guarantee intact.
   */
  #dispatchedThisRun = new Set<string>();
  /**
   * staged-verify-gate-convergence (IMPORTANT #2) — coherence-unit IDs this
   * process has DETERMINISTICALLY SHIPPED (a green-gate staged local settle that
   * opened/converged a PR via {@link WorkspaceManager.shipWorkspace}). A DURABLE,
   * process-lifetime double-ship guard: after a ship the unit's `state.completed`
   * lock is only TRANSIENT — `reconcileCompletedAndClaimed` releases it after
   * `pollIntervalMs * COMPLETED_GRACE_MULTIPLIER` for a row that is still an active
   * candidate (a shipped staged row stays `in-progress` until its PR MERGES; only
   * the lane went `in_review`). Without this set the shipped unit is re-selected
   * past the grace window and RE-SHIPPED (a duplicate PR).
   *
   * Single-dispatch parity: the single-dispatch normal-exit path
   * (`handleCompletionSideEffects` → `tracker.markIssueComplete`) instead flips the
   * roadmap ROW to a terminal state, so the row stops being an active candidate and
   * the grace release never fires — that is single-dispatch's durable guard. The
   * staged ship path deliberately does NOT terminalize the row early (D4: the
   * PR-MERGE auto-dones it; an early `done` would break the auto-done reconciler +
   * RMH005), so it carries its OWN in-memory durable guard here. Consulted in
   * {@link filterCandidatesWithOpenPRs} (removes shipped units from the tick's
   * candidate set) and in {@link dispatchIssue} (belt-and-suspenders skip). Reset
   * only by process lifetime — after a restart the merged/auto-done row (or the
   * open-PR filter) keeps it from re-dispatching.
   */
  #shippedThisRun = new Set<string>();
  /**
   * staged-verify-gate-convergence (needs-human terminal double-select guard).
   * Sibling of {@link #shippedThisRun}, but for the OTHER staged-local terminal:
   * a unit that EXHAUSTED its bounded retries and escalated to needs-human. That
   * terminal marks the LANE (`abandon`/`canceled`), NOT the row — the roadmap row
   * stays `in-progress`, so absent this exclusion the tick re-selects it, the retry
   * counter resets, and the unit loops forever (5 gate-fails → terminal → canceled →
   * tick re-dispatches fresh → counter resets → repeat). Consulted in
   * {@link filterCandidatesWithOpenPRs} (drops escalated units from the candidate
   * set) and in {@link dispatchIssue} (belt-and-suspenders skip for a due-retry
   * re-dispatch that bypasses the candidate filter). Reset only by process lifetime.
   */
  #escalatedThisRun = new Set<string>();
  /**
   * Spec 2 SC30 / Task 11: per-dispatch backend factory replaces the
   * Phase 1 `runner` / `localRunner` two-runner split. Each
   * `dispatchIssue()` call asks the factory for a `RoutingUseCase`-routed
   * `AgentBackend`, then wraps it in a fresh `AgentRunner`.
   *
   * `AgentRunner` is stateless (just `{ backend, options }`), so
   * per-dispatch construction is safe and avoids the cross-call state
   * the old two-runner split had to coordinate.
   *
   * Null only in the legacy fallback path: when `migrateAgentConfig`
   * throws (legacy configs missing supplemental fields, e.g.
   * `agent.backend='anthropic'` with no `agent.model`) AND no
   * `overrides.backend` is supplied, factory construction is skipped to
   * preserve the prior behavior of failing at dispatch time rather than
   * construction time. Eliminating this fallback is autopilot Phase 4+.
   */
  private backendFactory: OrchestratorBackendFactory | null;
  /**
   * AMR Phase 3 (D11): opt-in adaptive router. Constructed ONLY when
   * `agent.routing.policy` is present and non-empty; `null` otherwise so
   * dispatch stays byte-identical on the shipped `BackendRouter`
   * (SC8/SC17/SC19). Exposed for tests via {@link getAdaptiveRouter}.
   */
  private adaptiveRouter: AdaptiveRouter | null = null;
  /**
   * Spec B Phase 4 (D8): per-orchestrator in-process bus for
   * `RoutingDecision` events. Constructed alongside backendFactory when
   * agent.backends synthesis succeeds; null when legacy single-backend
   * config bypassed backends. Phase 5+ consumers (HTTP, WS, dashboard)
   * subscribe via `getRoutingDecisionBus()`.
   */
  private routingDecisionBus: RoutingDecisionBus | null;
  /**
   * Test-only: when overrides.backend is provided, dispatch uses this
   * instance directly (bypassing the factory). Mirrors Phase 1
   * `overrides.backend → this.runner.backend` behavior so existing
   * MockBackend-injection tests keep working without touching the
   * factory's routing path.
   */
  private overrideBackend: AgentBackend | null;
  private renderer: PromptRenderer;
  private promptTemplate: string;
  /**
   * Backend-aware local dispatch template (Phase 1). Set from
   * `overrides.localPromptTemplate` (production: threaded by the CLI from
   * WorkflowLoader). Undefined -> resolvePromptTemplate falls back to the
   * default template (SC5).
   */
  private localPromptTemplate: string | undefined;
  /**
   * local-backend-full-workflow Phase 2 (Option C): the verify runner the
   * local-only enforced gate (`runLocalWorkflowGate`) invokes to run the
   * project's mechanical gate (typecheck + lint + test) over the workspace.
   * Injected in tests to force fail→pass sequences; in production it defaults
   * to `defaultLocalVerifyRunner` (a thin project-script probe). Kept as a
   * field seam — mirrors how `execFileFn` is injected — so the completion path
   * is decoupled from the concrete detector.
   */
  private verifyRunner: (workspacePath: string) => Promise<{ ok: boolean; output: string }>;
  /**
   * local-backend-full-workflow (Blocker 2b): the diff runner the local-only
   * enforced gate invokes BEFORE verify to detect an empty diff (the agent
   * completed without implementing anything). Injected in tests to force
   * has/has-no-changes; in production it defaults to `defaultLocalDiffRunner`
   * (a `git status --porcelain` probe). Mirrors the `verifyRunner` seam so the
   * completion path is decoupled from the concrete detector.
   */
  private diffRunner: (workspacePath: string) => Promise<{ hasChanges: boolean }>;
  /**
   * doc-coverage gate: after verify passes, block a change that ADDS a new public
   * source file without referencing it under `docs/` — so the local gate matches a
   * real ship (the repo's doc-drift check) instead of stopping at typecheck+lint+test.
   * Injected in tests; defaults to {@link defaultLocalDocCoverageRunner}. Fail-OPEN.
   */
  private docCoverageRunner: (workspacePath: string) => Promise<{ ok: boolean; output: string }>;
  /**
   * staged-verify-gate-convergence D2: the acceptance runner the settle gate
   * invokes when a matched workflow decl declares an `acceptance` command. Runs
   * that operator-declared command in the workspace and gates on its exit code, in
   * place of `verifyRunner`. Injected in tests; defaults to
   * `defaultLocalAcceptanceRunner`. Mirrors the `verifyRunner`/`diffRunner` seams.
   */
  private acceptanceRunner: (
    workspacePath: string,
    command: string
  ) => Promise<{ ok: boolean; output: string }>;
  /**
   * Phase 2: the most recent gate-failure reason per issue, threaded into the
   * next dispatch's rendered prompt as a failure preamble (the re-prompt). Set
   * when a local gate blocks; consumed + cleared at the next `dispatchIssue`
   * render for that issue.
   */
  private priorGateFailureByIssue = new Map<string, string>();
  /**
   * staged-verify-gate-convergence D3: per-unit count of consecutive staged-settle
   * gate failures. Incremented each time `settleWorkflowSuccess`'s local gate blocks
   * and re-dispatches; at `maxLocalStageGateRetries` the unit escalates to the
   * needs-human terminal (D3) instead of retrying again. Cleared when the unit
   * settles terminally or ships (a green gate), so a later re-pickup starts fresh.
   */
  private localStageGateAttempts = new Map<string, number>();
  /**
   * Resume-from-failed-stage checkpoint: per unit, the completed `checkpoint: true`
   * stage runs (stageIndex → StageRun) that survive gate-block re-dispatches so the
   * stable design (spec/plan) is reused instead of regenerated each retry. Cleared on
   * every terminal (ship or needs-human) alongside {@link localStageGateAttempts}, so a
   * fresh re-pickup regenerates the design.
   */
  private stageCheckpoints = new Map<string, Map<number, StageRun>>();
  private server?: OrchestratorServer;
  private interval?: ReturnType<typeof setTimeout> | undefined;
  private heartbeatInterval?: ReturnType<typeof setInterval> | undefined;
  private logger: StructuredLogger;
  private interactionQueue: InteractionQueue;
  /**
   * Per-named-backend resolver map (Spec 2 SC37). Each `local`/`pi` entry
   * in `agent.backends` spawns one `LocalModelResolver`. Legacy
   * single-backend configs converge here via `migrateAgentConfig` (Task 9),
   * so this map is the single source of truth post-migration.
   */
  private localResolvers = new Map<string, LocalModelResolver>();
  /**
   * Consumption Phase 1 (T2): bus listener that debounce-refreshes every local
   * resolver when a `local-models:pool` mutation fires, so a just-installed or
   * swapped model becomes usable within the refresh window instead of waiting up
   * to `probeIntervalMs` for the next poll. Held for removal in {@link stop}.
   */
  private poolRefreshListener: (() => void) | null = null;
  /** Phase 4 (D5): pool-state port shared by all local/pi resolvers. Null when LMLM disabled. */
  private poolStateProvider: PoolStateProvider | null = null;
  private poolStateStore: PoolStateStore | null = null;
  /**
   * LMLM Phase 6: live model pool + its installer. Constructed only when
   * `localModels.enabled` and a real `PoolStateStore` exists (not a test
   * override). Exposed to the server via `getModelPool()`, which retires the
   * proposals-route 501 stub for `kind: 'model'` approve/reject. Null when LMLM
   * is disabled. `PoolManager` reads `store.snapshot()` lazily, so constructing
   * before `store.load()` (in initLocalModelAndPipeline) is safe.
   */
  private modelPool: PoolManager | null = null;
  private modelInstaller: InstallAdapter | null = null;
  /**
   * S1 drain re-entrancy guard (P7-SUG-DRAIN-REENTRANCY). `drainDeferredEvictions`
   * is fired fire-and-forget from `emitWorkerExit` (and, since P7-SUG-DRAIN-LIVENESS,
   * piggybacked on each refresh tick). Two overlapping drains would both read the
   * same `listPendingEvictions()` snapshot, both re-check `isLocalModelInUse`, and
   * both `await pool.evict` the SAME name — double-calling the installer and
   * broadcasting a duplicate `evict_completed` frame. The single-threaded event
   * loop makes a plain boolean sufficient: a drain that arrives while one is
   * running returns early rather than double-processing.
   */
  private draining = false;
  /**
   * LMLM Phase 6: single per-instance background refresh scheduler. Started in
   * `initLocalModelAndPipeline` when the pool exists; stopped in `stop()`. Null
   * when LMLM is disabled. Exposed to the server via `getRefreshScheduler()`.
   */
  private refreshScheduler: RefreshScheduler | null = null;
  /**
   * LMLM Phase 7: the hardware-aware recommender bound at scheduler start. Reused
   * by `GET /api/v1/local-models/recommendations`. Null when LMLM is disabled (no
   * pool → scheduler never armed). Ranks the (currently empty) candidate set —
   * see the Phase 2 candidate-parser gap noted on `startRefreshScheduler`.
   */
  private modelRecommender: ReturnType<typeof createNativeRecommender> | null = null;
  /**
   * The candidate set the current `modelRecommender` was seeded over. Held so the
   * harness-fit probe's `reRankWithBuildQuality` can re-run the SAME ranking path over
   * these candidates augmented with probed `buildQuality` (harness-fit-probe D5).
   */
  private recommenderCandidates: readonly RankerCandidate[] = [];
  /** Live HF candidate discovery (injectable for tests so startup makes no network calls). */
  private readonly discoverCandidatesFn: (
    opts: DiscoverCandidatesOptions
  ) => Promise<DiscoverCandidatesResult>;
  /** Snapshot of the last candidate seeding, surfaced to the refresh route. */
  private candidateSourceState: { source: 'frozen' | 'live'; count: number } = {
    source: 'frozen',
    count: 0,
  };
  /** Test seam: injected timer/clock for the scheduler so no real 24h timer runs. */
  private readonly schedulerTimerOverride: {
    setTimer?: (cb: () => void, delayMs: number) => SchedulerTimerHandle;
    clearTimer?: (handle: SchedulerTimerHandle) => void;
    now?: () => number;
    random?: () => number;
  } | null;
  /**
   * Spec B Phase 3: skill catalog (name + cognitiveMode) read once at
   * construction from `projectRoot/agents/skills/`. Consulted by
   * `buildRoutingUseCase` at dispatch start to construct
   * `{ kind: 'skill', skillName, cognitiveMode }` RoutingUseCases.
   * Empty when the orchestrator runs outside a harness project root
   * (then dispatch falls through to per-tier, preserving F11/N2).
   */
  private readonly skillCatalog: readonly SkillCatalogEntry[];
  /**
   * Per-resolver `onStatusChange` unsubscribe callbacks. Spec 2 Phase 5
   * (SC39): each local/pi resolver gets its own listener emitting a
   * `NamedLocalModelStatus` event tagged with `backendName` + `endpoint`.
   * The previous single-resolver field (`localModelStatusUnsubscribe`)
   * is replaced by this list so multi-local configs can teardown all
   * listeners on `stop()` without a Map mutation.
   */
  private localModelStatusUnsubscribes: Array<() => void> = [];
  private pipeline: IntelligencePipeline | null;
  /**
   * AMR live-classifier provider (final-review finding #2). The complexity
   * cascade may spend a fast-tier LLM tie-break; it borrows the SEL-layer
   * AnalysisProvider. Built lazily on first classify (the AdaptiveRouter is
   * constructed before start(), so this cannot be eager); `null` means "no
   * provider — cascade stays fully offline / static-only". `undefined` means
   * "not yet resolved".
   */
  private complexityProvider: AnalysisProvider | null | undefined = undefined;
  private analysisArchive: AnalysisArchive;
  private graphStore: GraphStore | null = null;
  private claimManager: ClaimManager | null = null;
  private prDetector: PRDetector;
  private maintenanceScheduler: MaintenanceScheduler | null = null;
  private maintenanceReporter: MaintenanceReporter | null = null;
  // Phase 3 webhooks. `webhookStore` is constructed at server-start and held
  // only as a local; it's passed into `ServerDependencies` and
  // `wireWebhookFanout` once and never re-read on `this`. The fan-out
  // teardown handle is kept on the instance so `stop()` can detach listeners.
  //
  // Phase 4 delivery durability: the WebhookQueue (SQLite at
  // `.harness/webhook-queue.sqlite`) and the WebhookDelivery worker are
  // retained as instance fields so `stop()` can drain in-flight deliveries
  // (await worker.stop()) and close the SQLite handle (queue.close()).
  private webhookFanoutOff?: () => void;
  private webhookQueue?: WebhookQueue;
  private webhookDeliveryWorker?: WebhookDelivery;
  // Phase 5: prompt-cache metrics + OTLP trace export. Both are constructed
  // unconditionally so non-telemetry call sites can reference them safely; the
  // OTLPExporter is only handed a fanout subscription when config supplies an
  // endpoint, and `enabled: false` keeps push() a constant-time no-op.
  private cacheMetrics?: CacheMetricsRecorder;
  private otlpExporter?: OTLPExporter;
  private telemetryFanoutOff?: () => void;
  // Hermes Phase 3: in-process notification sinks subscribe to the same
  // event bus (`this`) that webhook fanout uses, applying envelope
  // formatting before delivering to Slack/etc. The registry + unwire
  // handle are kept on the instance so stop() can detach listeners and
  // call adapter dispose() in deterministic order.
  private notificationsRegistry?: SinkRegistry;
  private notificationFanoutOff?: () => void;
  private orchestratorIdPromise: Promise<string>;
  private recorder: StreamRecorder;
  /** Black-box for this run (one process lifetime). Null until constructed; all calls best-effort. */
  private flightRecorder: FlightRecorder | null = null;
  private readonly flightRunId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  private intelligenceRunner: IntelligencePipelineRunner;
  private completionHandler: CompletionHandler;

  /** Project root directory, derived from workspace root. */
  private get projectRoot(): string {
    return path.resolve(this.config.workspace.root, '..', '..');
  }
  private enrichedSpecsByIssue: Map<string, EnrichedSpec> = new Map();
  /** Tracks recently-failed intelligence analysis to avoid re-requesting every tick */
  private analysisFailureCache: Map<string, number> = new Map();
  // Phase 3 added a private `roadmapMode` field used by `createTracker` to
  // guard the file-less stub. Phase 4 / S2 / D-P4-E shifted dispatch onto
  // `tracker.kind`, removing the need for the field — it is now dropped to
  // satisfy `noUnusedLocals`. See decision D-P3-orchestrator-mode-via-fs-read.
  /** Abort controllers and PIDs for running agent tasks — used by stopIssue to cancel in-flight work.
   *  The PID is stored here because the running entry may be deleted by the state machine
   *  before the stop effect executes (e.g., stall_detected removes the entry first). */
  private abortControllers: Map<string, { controller: AbortController; pid: number | null }> =
    new Map();
  /** Guards against overlapping ticks when a tick takes longer than the polling interval */
  private tickInProgress = false;
  /** Phase 4 (DLane-5): lanes read back from the durable log on first tick, for
   *  observability only — NOT fed into reconciliation. Empty until the first tick. */
  private persistedLanes: PersistedLanes = { tasks: {} };
  /** Ensures the lane read-back diagnostic runs at most once (first tick). */
  private laneReadbackDone = false;
  /** Timestamp of the last stale branch sweep (at most once per hour) */
  private lastBranchSweepMs = 0;
  /** Current tick-phase activity visible to the dashboard */
  private tickActivity: {
    phase: 'idle' | 'fetching' | 'analyzing' | 'dispatching';
    detail: string | null;
    progress: { current: number; total: number } | null;
  } = { phase: 'idle', detail: null, progress: null };

  /**
   * Creates a new Orchestrator instance.
   *
   * @param config - The workflow configuration
   * @param promptTemplate - The template used to generate agent instructions
   * @param overrides - Optional dependency overrides for testing or custom behavior
   */
  constructor(
    config: WorkflowConfig,
    promptTemplate: string,
    overrides?: {
      tracker?: IssueTrackerClient;
      backend?: AgentBackend;
      execFileFn?: ExecFileFn;
      poolState?: PoolStateProvider;
      /** LMLM Phase 6 test seam: inject the RefreshScheduler timer/clock. */
      schedulerTimer?: {
        setTimer?: (cb: () => void, delayMs: number) => SchedulerTimerHandle;
        clearTimer?: (handle: SchedulerTimerHandle) => void;
        now?: () => number;
        random?: () => number;
      };
      /** Live-candidate-discovery seam: tests inject a fake so startup makes no HF calls. */
      discoverCandidates?: (opts: DiscoverCandidatesOptions) => Promise<DiscoverCandidatesResult>;
      /** Phase 1: backend-aware local dispatch template. Undefined -> fallback. */
      localPromptTemplate?: string;
      /**
       * Phase 2 (Option C) test seam: the verify runner the local enforced
       * gate invokes. Injected so tests can force fail→pass sequences without
       * spawning real typecheck/lint/test. Defaults to `defaultLocalVerifyRunner`.
       */
      verifyRunner?: (workspacePath: string) => Promise<{ ok: boolean; output: string }>;
      /**
       * Blocker 2b test seam: the diff runner the local enforced gate invokes
       * to detect an empty diff before verify. Injected so tests can force
       * has/has-no-changes without a real git tree. Defaults to
       * `defaultLocalDiffRunner`.
       */
      diffRunner?: (workspacePath: string) => Promise<{ hasChanges: boolean }>;
      /** Test seam for the doc-coverage gate; defaults to `defaultLocalDocCoverageRunner`. */
      docCoverageRunner?: (workspacePath: string) => Promise<{ ok: boolean; output: string }>;
      /**
       * staged-verify-gate-convergence D2 test seam: the acceptance runner the
       * settle gate invokes for a decl with an `acceptance` command. Injected so
       * tests can force pass/fail without spawning a real command. Defaults to
       * `defaultLocalAcceptanceRunner`.
       */
      acceptanceRunner?: (
        workspacePath: string,
        command: string
      ) => Promise<{ ok: boolean; output: string }>;
    }
  ) {
    super();
    this.schedulerTimerOverride = overrides?.schedulerTimer ?? null;
    // Default to a no-op so constructing the orchestrator (e.g. in tests) makes
    // NO HuggingFace calls on startup. The production entry point (the CLI's
    // `orchestrator run`) wires the real `discoverCandidates` explicitly.
    this.discoverCandidatesFn =
      overrides?.discoverCandidates ?? (async () => ({ candidates: [], warnings: [] }));
    // Phase 2 plan risk #3: the SSE handler at GET /api/v1/events
    // subscribes to 9 event-bus topics per connection (maintenance:*,
    // interaction.created, interaction.resolved, etc.). Node's default
    // EventEmitter max-listeners cap is 10, so two concurrent SSE clients
    // would trip MaxListenersExceededWarning at runtime. Raise the cap to
    // 50 to absorb multi-client load; Phase 4 will move SSE fan-out
    // behind a broker (per spec D7 — webhook delivery worker shares the
    // same bus) and this lift can be revisited then.
    this.setMaxListeners(50);
    this.config = config;
    this.promptTemplate = promptTemplate;
    this.localPromptTemplate = overrides?.localPromptTemplate;
    this.verifyRunner = overrides?.verifyRunner ?? defaultLocalVerifyRunner;
    this.diffRunner = overrides?.diffRunner ?? defaultLocalDiffRunner;
    this.docCoverageRunner = overrides?.docCoverageRunner ?? defaultLocalDocCoverageRunner;
    this.acceptanceRunner = overrides?.acceptanceRunner ?? defaultLocalAcceptanceRunner;
    this.state = createEmptyState(config);
    this.logger = new StructuredLogger();

    // Spec 2 / Task 9: Apply legacy → modern config migration eagerly so
    // every downstream code path observes a uniform `agent.backends` +
    // `agent.routing` shape. `migrateAgentConfig` is a no-op when
    // `agent.backends` is already set; it synthesizes both fields when
    // only legacy fields are set (Phase 0 SC9-SC11). After this block,
    // `this.config.agent.backends` is guaranteed populated for migrated
    // configs.
    //
    // Defensive fallback: legacy configs that lack the supplemental fields
    // a synthesized BackendDef would need (e.g., `agent.backend='anthropic'`
    // without `agent.model`) cause `migrateAgentConfig` to throw. The
    // existing legacy `createBackend()` path (constructed below from
    // `agent.backend` directly) is more permissive and tolerates these
    // configs at runtime. Until autopilot Phase 4 retires the legacy
    // `createBackend()` entry point entirely, we swallow synthesis errors
    // and fall through to the legacy path with a warn so dispatch
    // behavior is unchanged for these older configs.
    try {
      const migrationResult = migrateAgentConfig(this.config.agent);
      if (migrationResult.warnings.length > 0) {
        for (const w of migrationResult.warnings) this.logger.warn(w);
      }
      this.config = { ...this.config, agent: migrationResult.config };
    } catch (err) {
      this.logger.warn(
        `migrateAgentConfig failed; continuing with legacy fields. ` +
          `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Phase 4 / S2 / D-P4-E: tracker dispatch is on `tracker.kind`, not
    // on `roadmap.mode`. The Phase 3 constructor-time read of
    // `harness.config.json` is no longer needed.

    // Spec B Phase 3: snapshot the skill catalog at construction. Reads
    // from `<projectRoot>/agents/skills/<host>/<skill>/skill.yaml`.
    // `projectRoot` is derived from `workspace.root` identically to the
    // `projectRoot` getter below; computing it inline here keeps the
    // constructor flow self-contained (the getter relies on a fully-
    // built `this.config`, which is true by this point).
    const skillCatalogRoot = path.resolve(this.config.workspace.root, '..', '..');
    this.skillCatalog = discoverSkillCatalog(skillCatalogRoot);
    if (this.skillCatalog.length === 0) {
      this.logger.warn(
        'Spec B Phase 3: skill catalog discovery returned 0 entries; per-skill / per-mode routing will fall through to per-tier. ' +
          `Looked under ${path.join(skillCatalogRoot, 'agents/skills')}.`
      );
    }

    // Initialize adapters based on config or overrides
    this.tracker = overrides?.tracker || this.createTracker();
    this.workspace = new WorkspaceManager(
      {
        ...config.workspace,
        // Seed the brainstorm handoff artifacts into each fresh worktree. An
        // explicit `seedPaths` wins; otherwise derive from the tracker config
        // so a non-default roadmap location is still carried over.
        seedPaths: config.workspace.seedPaths ?? deriveSeedPaths(config),
      },
      {
        emitEvent: (event) => {
          // Phase 3 / spec D6 / R4: surface worktree base-ref fallback in
          // the same maintenance/event stream the dashboard subscribes to.
          // Two parallel channels mirror the maintenance task pattern at
          // orchestrator.ts:520-534: WebSocket fan-out + Node EventEmitter.
          this.server?.broadcastMaintenance('maintenance:baseref_fallback', event);
          this.emit('maintenance:baseref_fallback', event);
        },
      }
    );
    this.hooks = new WorkspaceHooks(config.hooks);
    this.renderer = new PromptRenderer();
    // Spec 2 SC30 / Task 11: capture the test-only backend override (if
    // any) for per-dispatch consumption. The factory itself is built
    // below, after the resolver Map is populated, so its
    // `getResolverModelFor` hook can read `this.localResolvers`.
    this.overrideBackend = overrides?.backend ?? null;

    // Phase 2 Task 8: pass `this` (Orchestrator extends EventEmitter) so
    // the queue can emit `interaction.created` / `interaction.resolved`
    // onto the same bus the SSE handler subscribes to.
    this.interactionQueue = new InteractionQueue(
      path.join(config.workspace.root, '..', 'interactions'),
      this
    );

    this.analysisArchive = new AnalysisArchive(path.join(config.workspace.root, '..', 'analyses'));

    // Spec 2 SC37 / Task 10: build per-named-backend LocalModelResolver
    // Map. Each `local`/`pi` entry in `agent.backends` spawns one resolver.
    // Legacy single-backend configs went through `migrateAgentConfig`
    // (Task 9), so this branch is uniform whether the user wrote
    // `agent.backends` or only legacy fields. Initial probe runs in
    // start() — at construction time each resolver exists but has not yet
    // observed its server, so status reports `available: false`. The
    // intelligence pipeline construction is deferred to start() so SC14
    // (pipeline disabled on local-unavailable) can be observed without
    // races.
    //
    // Note: `agent.localTimeoutMs` is the request timeout for
    // chat-completion calls (default 90s) — NOT the probe timeout. The
    // resolver uses its own 5s default for /v1/models probes so a hung
    // server fails fast rather than blocking the probe loop. If a
    // dedicated probe timeout is ever needed, add
    // `agent.localProbeTimeoutMs` rather than reusing localTimeoutMs.
    // Phase 4 (D5): resolve the shared pool-state provider once, before the
    // per-backend loop. Precedence: an injected `overrides.poolState` (test
    // seam) wins; otherwise, when `localModels.enabled`, construct a
    // PoolStateStore whose on-disk state is loaded in
    // initLocalModelAndPipeline() before the first probe. When neither
    // applies, the provider stays null and every resolver keeps its static
    // `configured` list (byte-identical to pre-Phase-4 behavior).
    const localModelsEnabled = this.config.localModels?.enabled === true;
    if (overrides?.poolState) {
      this.poolStateProvider = overrides.poolState;
    } else if (localModelsEnabled) {
      this.poolStateStore = new PoolStateStore({
        onWarn: (message, cause) =>
          this.logger.warn(message, cause !== undefined ? { cause } : undefined),
      });
      this.poolStateProvider = this.poolStateStore;
      // LMLM Phase 6: construct the live pool over the just-created store so the
      // server's getModelPool() accessor reaches a real PoolManager.
      this.initModelPool(this.poolStateStore);
    }
    const backendsMap = this.config.agent.backends ?? {};
    for (const [name, def] of Object.entries(backendsMap)) {
      if (isLocalEndpointBackend(def)) {
        const resolverOpts: import('./agent/local-model-resolver').LocalModelResolverOptions = {
          endpoint: def.endpoint,
          configured: typeof def.model === 'string' ? [def.model] : def.model,
          logger: this.logger,
        };
        if (def.apiKey !== undefined) resolverOpts.apiKey = def.apiKey;
        // `probeIntervalMs` exists on `local`/`pi` but not `ollama`; read it via
        // an in-guard so the ollama variant (no such field) stays type-safe.
        if ('probeIntervalMs' in def && def.probeIntervalMs !== undefined) {
          resolverOpts.probeIntervalMs = def.probeIntervalMs;
        }
        if (this.poolStateProvider !== null) resolverOpts.poolState = this.poolStateProvider;
        // T20: warm a newly-selected model into VRAM so the next dispatch isn't a
        // cold start. `local` (Ollama) uses the native keep_alive; `pi` (LM Studio
        // and other OpenAI-compatible servers with no keep_alive) warms via a
        // 1-token completion that JIT-loads the model.
        const endpoint = def.endpoint;
        const apiKey = def.apiKey;
        if (def.type === 'local') {
          resolverOpts.warmModel = (ollamaName) => {
            void defaultWarmModel(endpoint, ollamaName, apiKey);
          };
        } else {
          resolverOpts.warmModel = (model) => {
            void defaultWarmModelViaCompletion(endpoint, model, apiKey);
          };
        }
        this.localResolvers.set(name, new LocalModelResolver(resolverOpts));
      }
    }

    // Spec 2 SC30 / Task 11: construct the per-dispatch backend factory
    // now that the resolver Map is populated. The `getResolverModelFor`
    // hook lets the factory bind each `local`/`pi` BackendDef to its
    // resolver-owned `getModel` callback at instantiation time, so the
    // factory itself stays ignorant of resolver lifecycle.
    //
    // Skip factory construction when migration produced no `backends`
    // map. This happens when migrateAgentConfig threw (legacy configs
    // missing supplemental fields) and the catch above swallowed it.
    // Tests using `overrides.backend` (MockBackend injection) reach
    // dispatch through the override path and never consult the factory;
    // production legacy configs that hit this fallback would have crashed
    // at dispatch-time previously, so behavior is preserved.
    //
    // Cast: agent.sandboxPolicy is typed as `string` in WorkflowConfig
    // (legacy openness for forward-compat) but the factory + container
    // pipeline only recognize 'none' | 'docker'. Treat any other value
    // as 'none' to preserve the current behavior of the deleted
    // `createBackend` path: only 'docker' triggered container wrapping;
    // every other value (including unset) was effectively 'none'.
    // Phase 5: prompt-cache metrics recorder. Constructed unconditionally so
    // the backend factory below can forward it to Anthropic-capable backends
    // even when the server is disabled. The route handler at
    // GET /api/v1/telemetry/cache/stats reads getStats() on the same instance.
    this.cacheMetrics = new CacheMetricsRecorder();

    if (
      this.config.agent.backends !== undefined &&
      Object.keys(this.config.agent.backends).length > 0
    ) {
      const sandboxPolicy: 'none' | 'docker' =
        this.config.agent.sandboxPolicy === 'docker' ? 'docker' : 'none';
      // Routing fallback: when migration synthesized backends but no
      // routing (e.g., legacy single-backend config), default to the
      // first synthesized backend name so the BackendRouter ctor's
      // reference validator passes.
      const firstBackendName = Object.keys(this.config.agent.backends)[0];
      const routing = this.config.agent.routing ?? {
        default: firstBackendName ?? 'primary',
      };
      // Spec B Phase 4 (D8): construct the bus once per orchestrator
      // instance. Capacity hardcoded to 500 per operator decision D-OP-4
      // (configurable via schema delta in Phase 5/6). Logger threaded so
      // O1 routing-decision lines emit at info; S6 warn() lines emit on
      // subscriber faults.
      this.routingDecisionBus = new RoutingDecisionBus({
        capacity: 500,
        logger: this.logger,
      });
      this.backendFactory = new OrchestratorBackendFactory({
        backends: this.config.agent.backends,
        routing,
        sandboxPolicy,
        ...(this.config.agent.container !== undefined
          ? { container: this.config.agent.container }
          : {}),
        ...(this.config.agent.secrets !== undefined ? { secrets: this.config.agent.secrets } : {}),
        cacheMetrics: this.cacheMetrics,
        decisionBus: this.routingDecisionBus,
        getResolverModelFor: (name, useCase) => {
          const resolver = this.localResolvers.get(name);
          // T17: bind the routed use-case so resolveModel orders candidates by
          // its task profile (coding/reasoning/general).
          return resolver ? () => resolver.resolveModel(useCase) : undefined;
        },
        // Consumption Phase 3 (T11): bind per-backend runtime feedback. A
        // successful turn stamps `lastUsedAt` (LRU) via the pool and clears the
        // resolver's circuit breaker; a failed turn feeds the breaker so a
        // repeatedly-failing model is deprioritized. `modelPool` is read lazily
        // (per dispatch) because it loads in start(), after this constructor.
        getModelUsageHooksFor: (name) => {
          const resolver = this.localResolvers.get(name);
          if (!resolver) return undefined;
          return {
            onModelUsed: (model: string) => {
              resolver.recordSuccess(model);
              void this.modelPool?.markUsed(model);
            },
            onModelFailed: (model: string) => {
              resolver.recordFailure(model);
            },
          };
        },
      });

      // AMR Phase 3 (D11): construct AdaptiveRouter ONLY when routing.policy is
      // present AND non-empty. Absent/empty ⇒ dispatch stays on the shipped
      // BackendRouter, byte-identical, no classify(), no added latency
      // (SC8/SC17/SC19). The gate only CONSTRUCTS the router; it does NOT swap
      // forUseCase dispatch to route through it (that would risk the
      // byte-identical guarantee) — enrichment-on-dispatch is a later step.
      // AMR Phase 3 (D11): construct ONLY when routing.policy is present AND
      // non-empty (default-off gate). Phase 5 (D1): the construction body is
      // extracted to `buildAdaptiveRouter` so runtime policy ingestion
      // (`ingestRoutingPolicy`) builds a byte-identical router. The condition
      // inlines `policy !== undefined` so TS narrows `policy` to `RoutingPolicy`.
      const policy = routing.policy;
      this.adaptiveRouter =
        policy !== undefined && Object.keys(policy).length > 0
          ? this.buildAdaptiveRouter(policy)
          : null;
    } else {
      this.backendFactory = null;
      this.routingDecisionBus = null;
      // AMR Phase 3 (D11): no backends ⇒ no adaptive routing.
      this.adaptiveRouter = null;
    }

    // Pipeline construction deferred to start() — see initLocalModelAndPipeline().
    this.pipeline = null;

    this.orchestratorIdPromise = resolveOrchestratorId(config.orchestratorId);

    this.prDetector = new PRDetector({
      logger: this.logger,
      projectRoot: this.projectRoot,
      ...(overrides?.execFileFn ? { execFileFn: overrides.execFileFn } : {}),
    });

    this.recorder = new StreamRecorder(
      path.resolve(config.workspace.root, '..', 'streams'),
      this.logger
    );

    // Flight recorder ("black-box"): a durable, always-on forensic record of THIS
    // run, written beside the streams. Construction is I/O-free; provenance +
    // verdicts are captured in start()/at terminal points. Never breaks a dispatch.
    this.flightRecorder = new FlightRecorder(
      path.resolve(config.workspace.root, '..', 'black-box'),
      this.flightRunId,
      this.logger
    );

    // Use getters for pipeline/graphStore so test overrides are reflected
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const ctx: OrchestratorContext = {
      config: this.config,
      projectRoot: this.projectRoot,
      logger: this.logger,
      tracker: this.tracker,
      recorder: this.recorder,
      prDetector: this.prDetector,
      orchestratorIdPromise: this.orchestratorIdPromise,
      get pipeline() {
        return self.pipeline;
      },
      get graphStore() {
        return self.graphStore;
      },
      analysisArchive: this.analysisArchive,
      enrichedSpecsByIssue: this.enrichedSpecsByIssue,
      analysisFailureCache: this.analysisFailureCache,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      emit: this.emit.bind(this),
    };

    this.intelligenceRunner = new IntelligencePipelineRunner(ctx);
    this.completionHandler = new CompletionHandler(ctx, this.postLifecycleComment.bind(this));

    if (config.server?.port) {
      // Phase 3: webhook subscription store + delivery worker + fan-out.
      // Store persists to .harness/webhooks.json (mode 0600). Fan-out
      // subscribes to the orchestrator's EventEmitter (`this`) and dispatches
      // matching events into the delivery worker. stop() invokes
      // webhookFanoutOff() to drop the listeners cleanly.
      const webhookStore = new WebhookStore(
        path.join(this.projectRoot, '.harness', 'webhooks.json')
      );
      this.webhookQueue = new WebhookQueue(
        path.join(this.projectRoot, '.harness', 'webhook-queue.sqlite')
      );
      const webhookDelivery = new WebhookDelivery({
        queue: this.webhookQueue,
        store: webhookStore,
      });
      this.webhookDeliveryWorker = webhookDelivery;
      this.webhookFanoutOff = wireWebhookFanout({
        bus: this,
        store: webhookStore,
        delivery: webhookDelivery,
      });
      webhookDelivery.start();

      // Hermes Phase 3: in-process notification sinks. See setupNotifications.
      this.setupNotifications(config.notifications);

      // Phase 5: OTLP/HTTP trace exporter. Constructed only when the
      // operator configures `telemetry.export.otlp` in harness.config.json.
      // The fanout wires bus events (maintenance:*, skill_invocation,
      // dispatch:decision) to both the exporter and the webhook delivery
      // worker. The telemetry.* GatewayEvents respect the Task 9 exclusion
      // (legacy *.* subscriptions do not receive them).
      this.setupTelemetryExport(config, webhookStore, webhookDelivery);

      this.server = new OrchestratorServer(this, config.server.port, {
        interactionQueue: this.interactionQueue,
        webhooks: {
          store: webhookStore,
          delivery: webhookDelivery,
          queue: this.webhookQueue,
        },
        cacheMetrics: this.cacheMetrics,
        // Spec B Phase 5: routing observability accessors. Closures so the
        // server re-reads on every request — stop() / start() do not
        // require server reconstruction. Returns null if no backendFactory
        // (legacy single-backend configs), and the route handler renders
        // 503 in that case.
        getBackendRouter: () => this.getBackendRouter(),
        getRoutingDecisionBus: () => this.getRoutingDecisionBus(),
        getRoutingConfig: () => this.getRoutingConfig(),
        getBackends: () => this.getBackends(),
        // AMR Phase 5 (D1/D2): runtime policy ingestion + telemetry projection.
        ingestRoutingPolicy: (p) => this.ingestRoutingPolicy(p),
        getRoutingTelemetry: () => this.getRoutingTelemetry(),
        getRoutingStatus: () => this.getRoutingStatus(),
        plansDir: path.resolve(config.workspace.root, '..', 'docs', 'plans'),
        pipeline: this.pipeline,
        analysisArchive: this.analysisArchive,
        roadmapPath: config.tracker.filePath ?? null,
        dispatchAdHoc: this.dispatchAdHoc.bind(this),
        getLocalModelStatus: () => this.getFirstLocalModelStatus(),
        getLocalModelStatuses: () => this.buildLocalModelStatuses(),
        // LMLM Phase 6: expose the live pool so kind:'model' approve/reject
        // reaches PoolManager (retiring the 501). Null when LMLM is disabled.
        getModelPool: () => this.modelPool,
        // LMLM Phase 7 / S1: conservative in-use probe so an approved swap/evict
        // of a model an agent could be using is DEFERRED, not applied mid-request
        // (ADR 0060). Agent-run-coarse; may over-defer (safe).
        isModelInUse: (ollamaName: string) => this.isLocalModelInUse(ollamaName),
        // LMLM Phase 6: expose the refresh scheduler for POST /local-models/refresh.
        getRefreshScheduler: () => this.refreshScheduler,
        // Live candidate refresh for POST /local-models/candidates/refresh (the
        // "Refresh" button). Null when LMLM is disabled → route 503s.
        getRefreshCandidates: () => (this.modelPool ? () => this.refreshCandidatesLive() : null),
        // LMLM Phase 7 read surface — hardware / recommendations / model proposals.
        // Each returns null/[] when LMLM is disabled so the route renders 503/[].
        getHardwareProfile: () => (this.modelPool ? this.detectLmlmHardware() : null),
        getRecommendations: async ({ top }) => {
          if (this.modelRecommender === null) return [];
          const hardware = await this.detectLmlmHardware();
          const { ranked } = await this.modelRecommender(hardware);
          // NOTE (Phase 2 gap): the native recommender ranks by hardware only —
          // `profile` (general/coding/reasoning) is not yet a ranking input, so
          // we honor `top` and ignore `profile` until the candidate parser lands.
          return ranked.slice(0, top);
        },
        listModelProposals: () =>
          listProposals(this.projectRoot, { status: 'open', kind: 'model' }),
      });

      this.server.setRecorder(this.recorder);

      // Phase 2 Task 12: WebSocket fan-out for legacy dashboard consumers
      // is intentionally retained alongside the Phase 2 event-bus path.
      // `InteractionQueue.push()` now also fires `interaction.created` on
      // the shared EventEmitter (Phase 2 Task 8), which feeds the SSE
      // handler at `GET /api/v1/events`. The two paths coexist by design:
      // the dashboard's existing `/ws` consumer keeps working unchanged,
      // and new SSE consumers (CLI bridges, future webhooks) subscribe to
      // the event bus. No rip-out of the WebSocket fan-out — it's the
      // legacy compatibility contract for dashboard sessions still on
      // the WebSocket transport. Phase 3 will graduate `interaction.created`
      // payloads to the richer `GatewayEvent` envelope; Phase 4 may unify
      // both fan-outs behind a single broker.
      this.interactionQueue.onPush((interaction) => {
        this.server?.broadcastInteraction(interaction);
      });
    }
  }

  /**
   * Phase 5: construct the OTLP/HTTP trace exporter and wire telemetry fanout.
   * Only fires when the operator configures `telemetry.export.otlp` in
   * harness.config.json. Extracted from the server-init block in the
   * constructor to keep that block's cyclomatic complexity under threshold.
   */
  private setupTelemetryExport(
    config: WorkflowConfig,
    webhookStore: WebhookStore,
    webhookDelivery: WebhookDelivery
  ): void {
    const otlpCfg = config.telemetry?.export?.otlp;
    if (!otlpCfg) return;
    this.otlpExporter = new OTLPExporter({
      endpoint: otlpCfg.endpoint,
      ...(otlpCfg.enabled !== undefined ? { enabled: otlpCfg.enabled } : {}),
      ...(otlpCfg.headers !== undefined ? { headers: otlpCfg.headers } : {}),
      ...(otlpCfg.flushIntervalMs !== undefined
        ? { flushIntervalMs: otlpCfg.flushIntervalMs }
        : {}),
      ...(otlpCfg.batchSize !== undefined ? { batchSize: otlpCfg.batchSize } : {}),
    });
    this.telemetryFanoutOff = wireTelemetryFanout({
      bus: this,
      exporter: this.otlpExporter,
      webhookDelivery,
      store: webhookStore,
    });
  }

  /**
   * Deprecated alias for /api/v1/local-model/status (Spec 1 endpoint retained
   * as a compat shim per spec line 35; superseded by getLocalModelStatuses for
   * the multi-local UI). Returns the first-registered resolver's status.
   */
  private getFirstLocalModelStatus(): import('@harness-engineering/types').LocalModelStatus | null {
    const first = this.localResolvers.values().next();
    return first.done ? null : first.value.getStatus();
  }

  /**
   * SC38: build NamedLocalModelStatus[] from each registered resolver, tagged
   * with its backendName + endpoint from the config.
   */
  private buildLocalModelStatuses(): import('@harness-engineering/types').NamedLocalModelStatus[] {
    const backends = this.config.agent.backends ?? {};
    const out: import('@harness-engineering/types').NamedLocalModelStatus[] = [];
    for (const [name, resolver] of this.localResolvers) {
      const def = backends[name];
      if (!def || (def.type !== 'local' && def.type !== 'pi')) continue;
      out.push({
        ...resolver.getStatus(),
        backendName: name,
        endpoint: def.endpoint,
      });
    }
    return out;
  }

  /**
   * S1 conservative in-use probe (ADR 0060). Returns `true` when ANY agent run
   * is live AND `ollamaName` is a currently-resolved (or last-detected) local
   * model — i.e. an agent could be routing inference to it right now.
   *
   * This signal is AGENT-RUN-COARSE, not per-request: `state.running` is keyed
   * by GitHub issue (spawned agent runs), NOT by inference call, and no
   * per-model request counter exists today. The probe therefore MAY OVER-DEFER
   * (a swap waits until the pool is idle). Over-deferral is exactly S1's
   * intended safe failure — never yank a model mid-request; occasionally wait
   * longer than strictly necessary. A fine-grained per-request signal is an
   * explicit deferred gap (ADR 0060).
   */
  private isLocalModelInUse(ollamaName: string): boolean {
    if (this.state.running.size === 0) return false;
    return this.buildLocalModelStatuses().some(
      (s) => s.resolved === ollamaName || s.detected.includes(ollamaName)
    );
  }

  /**
   * S1 drain (ADR 0060): complete any eviction that was DEFERRED because its
   * target was in use, now that the probe reports it idle. Best-effort — called
   * from the run-completion path; it never blocks dispatch and swallows
   * per-model errors (a failed or still-busy evict stays pending for the next
   * drain). `pendingEviction` is a transient overlay, so a missed drain simply
   * leaves the flag set until the next completion re-checks it.
   */
  private async drainDeferredEvictions(): Promise<void> {
    const pool = this.modelPool;
    if (pool === null) return;
    // Re-entrancy guard (P7-SUG-DRAIN-REENTRANCY): coalesce an overlapping drain
    // rather than double-processing the same pending set. Any work that arrives
    // while a drain is running is picked up by the next trigger (run completion
    // or refresh tick), which re-reads the live pending set.
    if (this.draining) return;
    this.draining = true;
    try {
      for (const ollamaName of pool.listPendingEvictions()) {
        if (this.isLocalModelInUse(ollamaName)) continue; // still busy — leave pending
        try {
          const result = await pool.evict({ ollamaName });
          if (result.status === 'error') continue; // leave pending; retry next drain
          pool.clearPendingEviction(ollamaName);
          this.emit('local-models:pool', {
            action: 'evict',
            // XP-2: `evicted` is uniformly string[] across all local-models:pool
            // emit sites — the drain wraps its single completed eviction in an
            // array to match the swap/add multi-evict shape.
            evicted: [ollamaName],
            phase: 'evict_completed',
          });
        } catch {
          // best-effort: leave the flag set for a subsequent drain
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private createTracker(): IssueTrackerClient {
    // Phase 4 / S2 (D-P4-E): dispatch on `tracker.kind`.
    // The roadmap-mode field is still resolved (used elsewhere) but is no
    // longer the dispatch point — the `validateRoadmapMode` validator in
    // core enforces mode/tracker consistency at config-load time.
    if (this.config.tracker.kind === 'github-issues') {
      const trackerCfg: TrackerClientConfig = {
        kind: 'github-issues',
        repo: this.config.tracker.projectSlug ?? '',
        ...(this.config.tracker.apiKey ? { token: this.config.tracker.apiKey } : {}),
        ...(this.config.tracker.endpoint ? { apiBase: this.config.tracker.endpoint } : {}),
      };
      const clientResult = createTrackerClient(trackerCfg);
      if (!clientResult.ok) throw clientResult.error;
      return new GitHubIssuesIssueTrackerAdapter(clientResult.value, this.config.tracker);
    }
    if (this.config.tracker.kind === 'roadmap') {
      return new RoadmapTrackerAdapter(this.config.tracker);
    }
    throw new Error(`Unsupported tracker kind: ${this.config.tracker.kind}`);
  }

  /**
   * Creates a TaskRunner for the maintenance scheduler.
   * CheckCommandRunner and CommandExecutor use real child_process execution.
   * AgentDispatcher remains stubbed (requires full skill dispatch integration).
   */
  private createMaintenanceTaskRunner(
    maintenanceConfig: import('@harness-engineering/types').MaintenanceConfig
  ): TaskRunner {
    const logger = this.logger;

    const checkRunner: CheckCommandRunner = {
      run: async (command: string[], cwd: string) => {
        // Built-in checkCommands are harness SUBCOMMAND argv (e.g. ['check-arch'],
        // ['graph','scan']); only `main-sync` carries an explicit leading
        // 'harness' literal. Resolve them through the `harness` binary on PATH
        // (the cron daemon's existing assumption — see main-sync) so a bare
        // subcommand name actually runs instead of ENOENT-ing.
        const [cmd, ...args] = normalizeHarnessCommand(command);
        if (!cmd) return { passed: true, findings: 0, output: '', executionFailed: false };
        // The spawn/parse/timeout/executionFailed core is shared with the
        // on-demand CLI runner (maintenance-run.ts → createCheckRunner) so cron
        // and CLI behave identically (ADR 0050). Cron differs only here: it runs
        // `harness` from PATH rather than the CLI's own entry script.
        return runHarnessCheck({ file: cmd, args }, cwd);
      },
    };

    // Resolve a configured backend by name into a live AgentBackend; null when
    // the maintenance task references a backend that isn't in agent.backends.
    // Shared with the on-demand CLI (`harness maintenance run --fix` →
    // makeResolveBackend) via `makeBackendResolver` so the two sites can't
    // drift. `getBackends()` returns the immutable synthesized map set in the
    // constructor, so capturing it once here matches the prior per-call read.
    const resolveBackend = makeBackendResolver(this.getBackends());
    const agentDispatcher: AgentDispatcher = createAgentDispatcher({
      resolveBackend,
      git: (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).toString().trim(),
      logger,
    });

    const commandExecutor: CommandExecutor = {
      exec: async (command: string[], cwd: string) => {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        // Housekeeping checkCommands are also harness subcommand argv (e.g.
        // ['cleanup-sessions'], ['harness','sync-main','--json']) — resolve
        // through the `harness` binary on PATH, stripping any explicit leading
        // 'harness' literal to avoid double-prefixing.
        const [cmd, ...args] = normalizeHarnessCommand(command);
        if (!cmd) return { stdout: '' };

        try {
          const { stdout } = await execFileAsync(cmd, args, {
            cwd,
            timeout: MAINTENANCE_CHECK_TIMEOUT_MS,
            maxBuffer: MAINTENANCE_CHECK_MAX_BUFFER,
          });
          return { stdout: String(stdout) };
        } catch (err) {
          logger.warn('Maintenance command execution failed', {
            command,
            cwd,
            error: String(err),
          });
          throw err;
        }
      },
    };

    // Hermes Phase 2 — wire output store, check-script runner, and context
    // resolver so custom tasks gain persistence + chaining. Built-ins
    // continue through the legacy paths unchanged.
    const outputStore = new TaskOutputStore({
      rootDir: path.join(this.projectRoot, '.harness', 'maintenance'),
      logger: this.logger,
    });
    const checkScriptRunner = new CheckScriptRunner(this.projectRoot);
    const skillReader: InlineSkillReader = {
      // The orchestrator does not own the skill registry; CLI-side skill
      // resolution wires this in via direct injection. Default: skill not
      // resolvable from the orchestrator boundary.
      read: async () => null,
    };
    const contextResolver = new ContextResolver({
      outputStore,
      skillReader,
      logger: this.logger,
    });

    return new TaskRunner({
      config: maintenanceConfig,
      checkRunner,
      agentDispatcher,
      commandExecutor,
      cwd: this.projectRoot,
      checkScriptRunner,
      contextResolver,
      outputStore,
    });
  }

  /**
   * Initializes the maintenance subsystem: reporter, scheduler, and server route wiring.
   * Extracted from start() to keep function length under threshold.
   */
  private async initMaintenance(
    maintenanceConfig: import('@harness-engineering/types').MaintenanceConfig
  ): Promise<void> {
    // Hermes Phase 2 — Validate user-defined customTasks before boot. The
    // validator is pure (no I/O); failures abort startup with a structured
    // error rather than surfacing later as a cryptic runtime crash.
    const validation = validateCustomTasks(
      maintenanceConfig.customTasks,
      BUILT_IN_TASKS as unknown as readonly import('./maintenance/types').TaskDefinition[]
    );
    if (!validation.ok) {
      const messages = validation.error.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
      throw new Error(`Invalid maintenance.customTasks configuration:\n${messages}`);
    }

    this.maintenanceReporter = new MaintenanceReporter({
      persistDir: path.join(this.projectRoot, '.harness', 'maintenance'),
      logger: this.logger,
    });
    await this.maintenanceReporter.load();

    const taskRunner = this.createMaintenanceTaskRunner(maintenanceConfig);
    const reporter = this.maintenanceReporter;

    this.maintenanceScheduler = new MaintenanceScheduler({
      config: maintenanceConfig,
      leaderElector: new SingleProcessLeaderElector(),
      logger: this.logger,
      historyProvider: reporter,
      onTaskDue: async (task) => {
        this.logger.info(`Maintenance task due: ${task.id}`, { taskId: task.id });
        const startPayload = { taskId: task.id, startedAt: new Date().toISOString() };
        this.server?.broadcastMaintenance('maintenance:started', startPayload);
        this.emit('maintenance:started', startPayload);

        const result = await taskRunner.run(task);
        await reporter.record(result);

        if (result.status === 'failure') {
          const errorPayload = { taskId: task.id, error: result.error };
          this.server?.broadcastMaintenance('maintenance:error', errorPayload);
          this.emit('maintenance:error', errorPayload);
        } else {
          this.server?.broadcastMaintenance('maintenance:completed', result);
          this.emit('maintenance:completed', result);
        }

        this.logger.info(`Maintenance task completed: ${task.id}`, {
          taskId: task.id,
          status: result.status,
          findings: result.findings,
          fixed: result.fixed,
        });
      },
    });
    this.maintenanceScheduler.start();

    // Wire maintenance route deps into the server
    if (this.server) {
      const scheduler = this.maintenanceScheduler;
      this.server.setMaintenanceDeps({
        scheduler,
        reporter,
        triggerFn: async (taskId: string) => {
          const tasks = scheduler.getResolvedTasks();
          const task = tasks.find((t) => t.id === taskId);
          if (!task) throw new Error(`Unknown task: ${taskId}`);
          // Directly invoke the onTaskDue callback, bypassing cron schedule
          const onTaskDue = scheduler.getOnTaskDue();
          await onTaskDue(task);
        },
      });
    }
  }

  private createIntelligencePipeline(): IntelligencePipeline | null {
    // Spec B Phase 1: the intelligence pipeline now consumes the
    // canonical BackendRouter via deps.router (required field, per
    // operator decision U2/U6 — no more toScalar fallback). If the
    // backend factory failed to construct (legacy config migration
    // threw), there is no router to thread and no intelligence
    // pipeline to build; return null and let the caller proceed
    // without intelligence (matches the prior behavior where
    // buildIntelligencePipeline returned null on unresolvable routes).
    if (!this.backendFactory) {
      // Spec B Phase 4 (closes P1-IMP-3): make the silent drop visible.
      // The only path here is a legacy config where agent.backends is
      // absent/empty (migration would normally synthesize), AND
      // intelligence.enabled was set. Dispatch would have already
      // failed; intelligence-only deployments are exceedingly rare but
      // should not get a null pipeline with zero diagnostic output.
      this.logger.warn(
        'intelligence pipeline disabled: no backendFactory available (legacy config without agent.backends)'
      );
      return null;
    }
    const bundle = buildIntelligencePipeline({
      config: this.config,
      localResolvers: this.localResolvers,
      logger: this.logger,
      router: this.backendFactory.getRouter(),
    });
    if (!bundle) return null;
    this.graphStore = bundle.graphStore;
    return bundle.pipeline;
  }

  /**
   * AMR live-classifier provider resolution (final-review finding #2). The
   * complexity cascade's OPTIONAL fast-tier tie-break borrows the SEL-layer
   * AnalysisProvider (the same one intelligence enrichment uses). Resolved and
   * memoized on first classify because the AdaptiveRouter is constructed BEFORE
   * start(), so the provider cannot be resolved eagerly.
   *
   * Returns `undefined` when no provider is available (intelligence disabled, no
   * backendFactory, or the layer resolves to nothing) — the cascade then stays
   * fully offline and returns the static verdict (never throws). A build failure
   * degrades the same way: static-only, never blocks dispatch (D4).
   */
  private resolveComplexityProvider(): AnalysisProvider | undefined {
    if (this.complexityProvider !== undefined) {
      return this.complexityProvider ?? undefined;
    }
    let provider: AnalysisProvider | null = null;
    try {
      if (this.config.intelligence?.enabled && this.backendFactory) {
        provider =
          buildAnalysisProviderForLayer('sel', {
            config: this.config,
            localResolvers: this.localResolvers,
            logger: this.logger,
            router: this.backendFactory.getRouter(),
          }) ?? null;
      }
    } catch {
      // Never let provider construction block dispatch — degrade to static-only.
      provider = null;
    }
    this.complexityProvider = provider;
    return provider ?? undefined;
  }

  /**
   * Lazily initializes the ClaimManager if it hasn't been created yet.
   * Called from both start() and asyncTick() to avoid duplicating the init block.
   */
  private async ensureClaimManager(): Promise<void> {
    if (!this.claimManager) {
      const orchestratorId = await this.orchestratorIdPromise;
      this.claimManager = new ClaimManager(this.tracker, orchestratorId);
      this.logger.info(`Orchestrator identity resolved: ${orchestratorId}`);
    }
  }

  public async asyncTick(): Promise<void> {
    // Ensure ClaimManager is initialized (no-op if start() already ran)
    await this.ensureClaimManager();

    // Load persisted data on first tick (can't await in constructor)
    await this.intelligenceRunner.loadPersistedData();

    // Phase 4 (DLane-5): on the first tick, read persisted task lanes back from
    // the durable log (Truth #9 — lane state survives across processes). This is
    // a diagnostic for observability only; it is NOT fed into reconciliation.
    if (!this.laneReadbackDone) {
      this.laneReadbackDone = true;
      await this.readBackPersistedLanes();
    }

    const nowMs = Date.now();

    // 1. Fetch candidates from tracker
    this.setTickActivity('fetching', 'Polling tracker for candidates');
    const candidatesResult = await this.tracker.fetchCandidateIssues();
    if (!candidatesResult.ok) {
      this.logger.error('Failed to fetch candidate issues', {
        error: String(candidatesResult.error),
      });
      return;
    }

    // 1b. Filter out candidates with open PRs
    const candidates = await this.filterCandidatesWithOpenPRs(candidatesResult.value);

    // 1c. Check for stale claims from dead orchestrators and release them
    await this.releaseStaleClaims(candidates);

    // 2. Fetch current status for running issues
    const runningIds = Array.from(this.state.running.keys());
    const runningStatesResult = await this.tracker.fetchIssueStatesByIds(runningIds);
    if (!runningStatesResult.ok) {
      this.logger.error('Failed to fetch running issue states', {
        error: String(runningStatesResult.error),
      });
      return;
    }

    // 3. Pre-process candidates through intelligence pipeline (if enabled)
    const pipelineResult = this.pipeline
      ? await this.intelligenceRunner.run(candidates, (phase, detail, progress) =>
          this.setTickActivity(phase, detail, progress)
        )
      : undefined;
    this.setTickActivity('dispatching', 'Applying state machine');
    const {
      concernSignals,
      enrichedSpecs,
      complexityScores,
      simulationResults,
      personaRecommendations,
    } = pipelineResult ?? {};

    // 4. Dispatch tick event to state machine
    const selfAssignee = await this.orchestratorIdPromise;
    const tickEvent: OrchestratorEvent = {
      type: 'tick' as const,
      candidates,
      runningStates: runningStatesResult.value,
      nowMs,
      selfAssignee,
      ...(concernSignals !== undefined && { concernSignals }),
      ...(enrichedSpecs !== undefined && { enrichedSpecs }),
      ...(complexityScores !== undefined && { complexityScores }),
      ...(simulationResults !== undefined && { simulationResults }),
      ...(personaRecommendations !== undefined && { personaRecommendations }),
    };

    let { nextState, effects } = applyEvent(this.state, tickEvent, this.config);
    this.state = nextState;

    // 5. Check for due retries (snapshot IDs before iterating to avoid stale-state issues)
    const dueRetryIds = [...nextState.retryAttempts.entries()]
      .filter(([, r]) => nowMs >= r.dueAtMs)
      .map(([id]) => id);
    for (const issueId of dueRetryIds) {
      const retryEvent: OrchestratorEvent = {
        type: 'retry_fired',
        issueId,
        candidates,
        nowMs,
        ...(concernSignals !== undefined && { concernSignals }),
      };
      const result = applyEvent(this.state, retryEvent, this.config);
      this.state = result.nextState;
      effects.push(...result.effects);
    }

    // 6. Handle effects
    for (const effect of effects) {
      await this.handleEffect(effect);
    }

    // 6b. Check for stalled agents — emit stall_detected if an agent hasn't
    //     produced any event within the configured stallTimeoutMs window.
    //     Snapshot stalled IDs first because applyEvent replaces this.state,
    //     invalidating any live Map iterator. Detection falls back to
    //     `startedAt` so an agent that emits zero events still times out.
    const stallTimeoutMs = this.config.agent.stallTimeoutMs;
    const stalledIds = detectStalledIssues(this.state.running, nowMs, stallTimeoutMs);
    for (const runId of stalledIds) {
      // Re-read from current state — a prior stall may have already removed this entry
      const runEntry = this.state.running.get(runId);
      if (!runEntry) continue;
      const reference = runEntry.session?.lastTimestamp ?? runEntry.startedAt;
      const silentSec = Math.round((nowMs - new Date(reference).getTime()) / 1000);
      const sinceWhat = runEntry.session?.lastTimestamp ? 'last event' : 'dispatch';
      this.logger.warn(
        `Agent stalled for ${runEntry.identifier}: ${silentSec}s since ${sinceWhat}`,
        {
          issueId: runId,
        }
      );
      const stallEvent: OrchestratorEvent = {
        type: 'stall_detected',
        issueId: runId,
      };
      const stallResult = applyEvent(this.state, stallEvent, this.config);
      this.state = stallResult.nextState;
      for (const eff of stallResult.effects) {
        await this.handleEffect(eff);
      }
    }

    // 7. Sweep expired stream recordings
    // Collect open PR numbers from currently running issues (best-effort)
    const openPrNumbers: number[] = [];
    for (const [, runEntry] of this.state.running) {
      const externalId = runEntry.issue.externalId;
      if (externalId) {
        const match = String(externalId).match(/#(\d+)$/);
        if (match?.[1]) openPrNumbers.push(parseInt(match[1], 10));
      }
    }
    this.recorder.sweepExpired(openPrNumbers);

    // 8. Sweep stale remote branches (at most once per hour)
    const BRANCH_SWEEP_INTERVAL_MS = 3_600_000;
    if (nowMs - this.lastBranchSweepMs >= BRANCH_SWEEP_INTERVAL_MS) {
      this.lastBranchSweepMs = nowMs;
      const deleted = await this.workspace.sweepStaleBranches({
        maxAgeDays: 7,
        checkPR: (branch) => this.prDetector.branchHasPullRequest(branch),
      });
      if (deleted.length > 0) {
        this.logger.info(`Swept ${deleted.length} stale remote branch(es)`, {
          branches: deleted,
        });
      }
    }

    this.setTickActivity('idle');
  }

  public async tick(): Promise<void> {
    if (this.tickInProgress) {
      this.logger.info('Tick skipped — previous tick still in progress');
      return;
    }
    this.tickInProgress = true;
    try {
      await this.asyncTick();
    } finally {
      this.tickInProgress = false;
      if (this.tickActivity.phase !== 'idle') {
        this.setTickActivity('idle');
      }
    }
  }

  /**
   * Processes a side effect generated by the state machine.
   *
   * @param effect - The effect to handle
   */
  private async handleEffect(effect: SideEffect): Promise<void> {
    switch (effect.type) {
      case 'stop':
        await this.stopIssue(effect.issueId);
        break;
      case 'updateTokens':
        // Pure state update
        break;
      case 'emitLog':
        this.logger.log(effect.level, effect.message, effect.context);
        break;
      case 'releaseClaim':
        // Pure state update
        break;
      case 'scheduleRetry':
        // Retry entry is already stored in state by the state machine;
        // the orchestrator polls dueAtMs on each tick. Log for observability.
        this.logger.info(
          `Retry scheduled for ${effect.issueId} (attempt ${effect.attempt}, delay ${effect.delayMs}ms)`
        );
        break;
      case 'cleanWorkspace':
        await this.cleanWorkspaceWithGuard(effect.identifier, effect.issueId);
        break;
      case 'escalate':
        await this.handleEscalation(effect as EscalateEffect);
        // local-backend-full-workflow Phase 3 (B2): the unit is handed to a human;
        // drop any recorded local-gate failure preamble so a future re-dispatch of
        // the SAME issue can't inherit a stale "previous attempt failed" block.
        this.priorGateFailureByIssue.delete((effect as EscalateEffect).issueId);
        // Phase 4 (DLane-5): escalation hands the issue off to a human — the
        // orchestrator abandons autonomous progress, so the lane moves to the
        // terminal `canceled`. On the failure→max-retries path this follows the
        // `blocked` set by emitWorkerExit('error'); `blocked→canceled` is
        // on-table. Pre-claim triage escalations move `planned→canceled`.
        await this.persistLaneSafe((effect as EscalateEffect).issueId, 'abandon');
        break;
      case 'claim':
        await this.handleClaimEffect(effect as ClaimEffect);
        break;
    }
  }

  /**
   * Phase 4 (DLane-5): persist an orchestrator lane transition to the durable
   * core event log at the effect boundary. NEVER throws — `persistLane` returns
   * an `Err` Result on failure, which is logged and swallowed here so a
   * lane-persistence failure can never break orchestrator dispatch.
   */
  private async persistLaneSafe(issueId: string, signal: OrchestratorLaneSignal): Promise<void> {
    const r = await persistLane(this.projectRoot, issueId, signal);
    if (!r.ok) {
      this.logger.warn(`lane persist failed for ${issueId} (${signal}): ${r.error.message}`);
    }
  }

  /**
   * Phase 4 (DLane-5): read persisted task lanes back from the durable log and
   * log a one-line summary. Stores the projection on `this.persistedLanes` for
   * observability. Read-only — never feeds reconciliation, never throws.
   */
  private async readBackPersistedLanes(): Promise<void> {
    const lanes = await readPersistedLanes(this.projectRoot);
    this.persistedLanes = lanes;
    const entries = Object.keys(lanes.tasks).map((id) => `${id}:${lanes.tasks[id]?.lane}`);
    const nonTerminal = entries.filter((e) => !e.endsWith(':done') && !e.endsWith(':canceled'));
    this.logger.info(
      `Lane read-back on startup: ${entries.length} persisted task(s), ${nonTerminal.length} non-terminal`,
      { nonTerminal }
    );
  }

  /**
   * Phase 4 (DLane-5): the task lanes most recently read back from the durable
   * log on startup, exposed for external observability. Read-only — a fresh
   * `{ tasks: {} }` until the first tick's read-back has run.
   */
  public getPersistedLanes(): PersistedLanes {
    return this.persistedLanes;
  }

  /**
   * Guards workspace cleanup by checking whether the agent pushed a branch
   * that does not yet have a pull request. If so, the worktree is preserved
   * and an interaction is queued so a human can create the PR manually.
   */
  private async cleanWorkspaceWithGuard(identifier: string, issueId: string): Promise<void> {
    const branch = await this.workspace.findPushedBranch(identifier);
    if (branch) {
      // Verify the branch actually exists on the remote before checking PRs.
      // Handles cases where the push failed or the branch was already deleted by a merge.
      const existsOnRemote = await this.workspace.branchExistsOnRemote(branch);
      if (!existsOnRemote) {
        this.logger.info(
          `Branch "${branch}" not found on remote for ${identifier}, cleaning up worktree`,
          { issueId }
        );
        await this.runBeforeRemoveHook(identifier);
        await this.workspace.removeWorkspace(identifier);
        return;
      }

      const result = await this.prDetector.branchHasPullRequest(branch);
      if (result.error) {
        // PR check failed (gh not installed, network error, etc.) — preserve the
        // worktree as a safety measure but don't escalate since we can't confirm
        // whether a PR exists.
        this.logger.warn(
          `PR check failed for ${identifier} branch "${branch}", preserving worktree`,
          { issueId, error: result.error }
        );
        return;
      }
      if (!result.found) {
        this.logger.warn(
          `Preserving worktree for ${identifier}: branch "${branch}" was pushed but no PR exists`,
          { issueId }
        );
        await this.interactionQueue.push({
          id: `interaction-${randomUUID()}`,
          issueId,
          type: 'needs-human',
          reasons: [`Agent pushed branch "${branch}" but did not create a PR. Worktree preserved.`],
          context: {
            issueTitle: identifier,
            issueDescription: null,
            specPath: null,
            planPath: null,
            relatedFiles: [],
          },
          createdAt: new Date().toISOString(),
          status: 'pending',
        });
        return;
      }
    }
    await this.runBeforeRemoveHook(identifier);
    await this.workspace.removeWorkspace(identifier);
  }

  /** Run the beforeRemove hook for a workspace. Failures are logged but non-fatal. */
  private async runBeforeRemoveHook(identifier: string): Promise<void> {
    const wsPath = this.workspace.resolvePath(identifier);
    const result = await this.hooks.beforeRemove(wsPath);
    if (!result.ok) {
      this.logger.warn(`beforeRemove hook failed for ${identifier}: ${result.error.message}`);
    }
  }

  /**
   * Delegates to PRDetector.filterCandidatesWithOpenPRs, THEN drops any unit this
   * process has already deterministically shipped (IMPORTANT #2 durable guard).
   *
   * The open-PR filter alone is insufficient here: a just-shipped staged unit's PR
   * may not yet be visible to `gh` (propagation lag) and its roadmap row is still
   * `in-progress`, so absent the `#shippedThisRun` exclusion the tick would re-select
   * it once the transient `state.completed` grace window expires and RE-SHIP it. This
   * exclusion is the process-lifetime double-ship guard — analogous to how the
   * single-dispatch path's `markIssueComplete` durably removes the row from the
   * active-candidate set.
   * @see PRDetector#filterCandidatesWithOpenPRs
   */
  private async filterCandidatesWithOpenPRs(candidates: Issue[]): Promise<Issue[]> {
    const withoutOpenPRs = await this.prDetector.filterCandidatesWithOpenPRs(candidates);
    // Two process-lifetime durable guards, both for staged-local terminals whose row
    // stays `in-progress`: #shippedThisRun (ship-success double-ship) and
    // #escalatedThisRun (bounded-retry needs-human, else the tick re-selects the row
    // and the retry counter resets → infinite loop). When BOTH are empty this is a
    // byte-identical no-op (early return, same array the detector produced).
    if (this.#shippedThisRun.size === 0 && this.#escalatedThisRun.size === 0) return withoutOpenPRs;
    return withoutOpenPRs.filter(
      (c) => !this.#shippedThisRun.has(c.id) && !this.#escalatedThisRun.has(c.id)
    );
  }

  /**
   * Scans candidate issues for stale claims from other orchestrators.
   * An issue is considered stale if:
   * - It is in an "in-progress" state
   * - It has an assignee that is NOT this orchestrator
   * - Its updatedAt timestamp exceeds the heartbeat TTL
   *
   * Stale claims are released so the issue becomes available on subsequent ticks.
   */
  private async releaseStaleClaims(candidates: Issue[]): Promise<void> {
    if (!this.claimManager) return;

    const orchestratorId = await this.orchestratorIdPromise;
    const ttlMs = (this.config.polling.intervalMs || 30000) * 20; // Default: ~10 minutes (20x interval)

    for (const issue of candidates) {
      // Only consider in-progress issues assigned to a different orchestrator
      const normalizedState = issue.state.toLowerCase();
      if (normalizedState !== 'in-progress') continue;
      if (!issue.assignee) continue;
      if (issue.assignee === orchestratorId) continue;

      if (this.claimManager.isStale(issue, ttlMs)) {
        this.logger.warn(
          `Releasing stale claim on ${issue.identifier} (assigned to ${issue.assignee}, last updated ${issue.updatedAt})`,
          { issueId: issue.id }
        );
        await this.claimManager.release(issue.id).catch((err) => {
          this.logger.warn(`Failed to release stale claim for ${issue.identifier}`, {
            issueId: issue.id,
            error: String(err),
          });
        });
      }
    }
  }

  /**
   * Handles an escalation effect by writing to the interaction queue and logging.
   */
  private async handleEscalation(effect: EscalateEffect): Promise<void> {
    this.logger.warn(
      `Escalating ${effect.identifier} to needs-human: ${effect.reasons.join('; ')}`,
      { issueId: effect.issueId }
    );

    await this.interactionQueue.push({
      id: `interaction-${randomUUID()}`,
      issueId: effect.issueId,
      type: 'needs-human',
      reasons: effect.reasons,
      context: {
        issueTitle: effect.issueTitle ?? effect.identifier,
        issueDescription: effect.issueDescription ?? null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
        ...(effect.enrichedSpec !== undefined && {
          enrichedSpec: {
            intent: effect.enrichedSpec.intent,
            summary: effect.enrichedSpec.summary,
            affectedSystems: effect.enrichedSpec.affectedSystems,
            unknowns: effect.enrichedSpec.unknowns,
            ambiguities: effect.enrichedSpec.ambiguities,
            riskSignals: effect.enrichedSpec.riskSignals,
          },
        }),
        ...(effect.complexityScore !== undefined && {
          complexityScore: {
            overall: effect.complexityScore.overall,
            confidence: effect.complexityScore.confidence,
            riskLevel: effect.complexityScore.riskLevel,
            blastRadius: effect.complexityScore.blastRadius,
            dimensions: effect.complexityScore.dimensions,
            reasoning: effect.complexityScore.reasoning,
            recommendedRoute: effect.complexityScore.recommendedRoute,
          },
        }),
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
  }

  /**
   * Handles a claim effect by calling claimAndVerify on the ClaimManager.
   * If claimed, proceeds to dispatch. If rejected, emits a claim_rejected
   * event to clean up the state machine.
   */
  private async handleClaimEffect(effect: ClaimEffect): Promise<void> {
    if (!this.claimManager) {
      this.logger.error('ClaimManager not initialized when handling claim effect');
      return;
    }

    const result = await this.claimManager.claimAndVerify(effect.issue.id);

    if (!result.ok) {
      this.logger.warn(`Claim failed for ${effect.issue.identifier}: ${result.error.message}`, {
        issueId: effect.issue.id,
      });
      // Treat claim errors as rejections to avoid blocking
      const rejectEvent: OrchestratorEvent = {
        type: 'claim_rejected',
        issueId: effect.issue.id,
      };
      const { nextState, effects } = applyEvent(this.state, rejectEvent, this.config);
      this.state = nextState;
      for (const e of effects) {
        await this.handleEffect(e);
      }
      return;
    }

    if (result.value === 'rejected') {
      this.logger.warn(
        `Claim rejected for ${effect.issue.identifier} — another orchestrator won the race`,
        { issueId: effect.issue.id }
      );
      const rejectEvent: OrchestratorEvent = {
        type: 'claim_rejected',
        issueId: effect.issue.id,
      };
      const { nextState, effects } = applyEvent(this.state, rejectEvent, this.config);
      this.state = nextState;
      for (const e of effects) {
        await this.handleEffect(e);
      }
      return;
    }

    // Claim succeeded — persist the lane (planned→claimed), post claim comment
    // to the GitHub issue, then dispatch. Lane persistence is best-effort and
    // never blocks dispatch.
    await this.persistLaneSafe(effect.issue.id, 'claim');
    await this.postClaimComment(effect.issue);
    await this.dispatchIssue(effect.issue, effect.attempt, effect.backend);
  }

  /**
   * Posts a structured comment on the GitHub issue when the orchestrator claims it.
   * Fire-and-forget: failures are logged but never block dispatch.
   */
  private async postClaimComment(issue: Issue): Promise<void> {
    await this.postLifecycleComment(issue.identifier, issue.externalId ?? null, 'claimed');
  }

  /**
   * Posts a lifecycle event comment to the GitHub issue.
   * Supports: claimed, completed, released.
   * Fire-and-forget: failures are logged but never block the caller.
   */
  private async postLifecycleComment(
    identifier: string,
    externalId: string | null,
    event: 'claimed' | 'completed' | 'released'
  ): Promise<void> {
    try {
      if (!externalId) return;

      const trackerConfig = loadTrackerSyncConfig(this.projectRoot);
      if (!trackerConfig) return;

      const token = process.env.GITHUB_TOKEN;
      if (!token) return;

      const orchestratorId = await this.orchestratorIdPromise;
      const adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

      const actionMap = {
        claimed: 'Dispatching agent for autonomous execution',
        completed: 'Agent finished successfully',
        released: 'Releasing back to candidate pool',
      };

      const body = [
        `**Orchestrator ${event.charAt(0).toUpperCase() + event.slice(1)}** \`${orchestratorId}\``,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| Time | ${timestamp} UTC |`,
        `| Orchestrator | \`${orchestratorId}\` |`,
        `| Event | ${actionMap[event]} |`,
      ].join('\n');

      const result = await adapter.addComment(externalId, body);
      if (!result.ok) {
        this.logger.warn(`Lifecycle comment failed for ${identifier}: ${result.error.message}`);
      }
    } catch (err) {
      // Best-effort: never block the caller, but log for diagnostics
      this.logger.debug('Lifecycle comment failed (best-effort)', {
        identifier,
        error: String(err),
      });
    }
  }

  /**
   * Phase 1 (local-backend-full-workflow): pick the dispatch template for
   * the resolved backend. `pi`/`local` backends get the bash-shaped local
   * template when one was loaded; every other backend — and any local
   * backend with no local template loaded (SC5) — gets the default. Pure
   * over (backendName, config.agent.backends, localPromptTemplate,
   * promptTemplate); unit-tested by orchestrator.template-resolution.test.ts.
   *
   * NOTE: the local template file (`harness.orchestrator.local.md`) carries a
   * full YAML frontmatter block, but that frontmatter is **intentionally
   * ignored** at dispatch — only the markdown body is loaded (WorkflowLoader
   * strips the frontmatter) and rendered here as the prompt. The frontmatter
   * exists solely so the file is a valid, self-documenting scaffold that
   * `harness init` can drop in; the orchestrator's configuration is always
   * read from the loaded `WorkflowConfig`, never from this template file's
   * frontmatter.
   */
  private resolvePromptTemplate(backendName: string): string {
    const def = this.config.agent.backends?.[backendName];
    const isLocal = def !== undefined && isLocalEndpointBackend(def);
    if (isLocal && this.localPromptTemplate !== undefined) {
      return this.localPromptTemplate;
    }
    return this.promptTemplate;
  }

  /**
   * Dispatches a new agent to work on an issue.
   *
   * Within-run retries reuse the worktree: the first dispatch of an
   * identifier in a given process provisions a fresh worktree, and any later
   * dispatch of the SAME identifier within that run preserves it (via
   * {@link WorkspaceManager.ensureWorkspace}'s `preserve` option) so the
   * agent's uncommitted partial progress survives the retry. A restart
   * (empty {@link #dispatchedThisRun}) wipes and recreates on first dispatch.
   * `afterCreate` runs only on the fresh-create dispatch (D3), never on reuse.
   *
   * @param issue - The issue to resolve
   * @param attempt - The retry attempt number
   */
  private async dispatchIssue(
    issue: Issue,
    attempt: number | null,
    backend?: 'local' | 'primary'
  ): Promise<void> {
    // IMPORTANT #2 — belt-and-suspenders double-ship guard. The candidate filter
    // (filterCandidatesWithOpenPRs) already removes a shipped unit from the tick's
    // selection, but a re-dispatch can also arrive via a due retry (retry_fired →
    // claim effect) that does not re-run that filter. A unit this process already
    // shipped must NEVER be dispatched again — its PR is open/converging and a
    // second run would double-ship. Skip silently (the guard is process-lifetime;
    // the PR-merge auto-dones the row).
    if (this.#shippedThisRun.has(issue.id)) {
      this.logger.info(`Skipping dispatch of already-shipped unit ${issue.identifier}`, {
        issueId: issue.id,
      });
      return;
    }
    // Same belt-and-suspenders guard for the OTHER staged-local terminal: a unit that
    // exhausted its bounded retries and escalated to needs-human. Its row stays
    // `in-progress`, so a due-retry re-dispatch (retry_fired → claim effect) that
    // bypasses filterCandidatesWithOpenPRs could re-dispatch it and reset the retry
    // counter (an infinite loop). Skip silently — the guard is process-lifetime.
    if (this.#escalatedThisRun.has(issue.id)) {
      this.logger.info(`Skipping dispatch of escalated (needs-human) unit ${issue.identifier}`, {
        issueId: issue.id,
      });
      return;
    }
    this.logger.info(`Dispatching issue: ${issue.identifier} (attempt ${attempt})`, {
      issueId: issue.id,
    });

    // Phase 4 (DLane-5): a worker is about to start → lane `claimed→in_progress`
    // (or `blocked→in_progress` on a retry dispatch). Best-effort, never blocks.
    await this.persistLaneSafe(issue.id, 'dispatch');

    try {
      // 1. Ensure workspace. A prior dispatch of this identifier in this run
      // ⇒ preserve the existing worktree (within-run retry keeps partial
      // progress); a fresh/first dispatch (or post-restart empty set) wipes
      // and recreates from the base ref (anti-stale). (D1)
      const preserve = this.#dispatchedThisRun.has(issue.identifier);
      const workspaceResult = await this.workspace.ensureWorkspace(issue.identifier, { preserve });
      if (!workspaceResult.ok) throw workspaceResult.error;
      const { path: workspacePath, reused } = workspaceResult.value;

      // 1b. Run afterCreate hook — only when the workspace was actually
      // (re)created, never on a preserved reuse (re-seeding would clobber the
      // agent's in-progress artifacts). (D3)
      if (!reused) {
        const afterCreateResult = await this.hooks.afterCreate(workspacePath);
        if (!afterCreateResult.ok) {
          this.logger.warn(
            `afterCreate hook failed for ${issue.identifier}: ${afterCreateResult.error.message}`
          );
        }
      }

      // 2. Run hooks (might generate/modify config files)
      const hookResult = await this.hooks.beforeRun(workspacePath);
      if (!hookResult.ok) throw hookResult.error;

      // 3. Scan workspace config files for injection patterns (now after hooks)
      const scanResult = await scanWorkspaceConfig(workspacePath);

      if (scanResult.exitCode === 2) {
        // High-severity findings — abort dispatch
        const findingSummary = scanResult.results
          .flatMap((r) => r.findings.filter((f) => f.severity === 'high'))
          .map((f) => `${f.ruleId}: ${f.message}`)
          .join('; ');
        this.logger.error(
          `Config scan blocked dispatch for ${issue.identifier}: ${findingSummary}`,
          { issueId: issue.id }
        );
        await this.emitWorkerExit(
          issue.id,
          'error',
          attempt,
          `Config scan found high-severity injection patterns: ${findingSummary}`
        );
        return;
      }

      // Mark this unit as provisioned in this run ONLY after it clears the
      // high-severity config-scan gate — a dispatch that aborts above stays a
      // "fresh" dispatch, so its next attempt wipes and recreates from base
      // rather than reusing an un-vetted worktree. (D1, review follow-up)
      this.#dispatchedThisRun.add(issue.identifier);

      if (scanResult.exitCode === 1) {
        // Medium-severity findings — taint session, continue
        const findings = scanResult.results.flatMap((r) =>
          r.findings
            .filter((f) => f.severity === 'medium')
            .map((f) => ({
              ruleId: f.ruleId,
              severity: f.severity as 'high' | 'medium' | 'low',
              match: f.match,
              ...(f.line !== undefined ? { line: f.line } : {}),
            }))
        );
        writeTaint(
          workspacePath,
          issue.id,
          'Medium-severity injection patterns found in workspace config files',
          findings,
          'orchestrator:scan-config'
        );
        this.logger.warn(
          `Config scan found medium-severity patterns for ${issue.identifier}. Session tainted.`,
          { issueId: issue.id }
        );
      }

      // split-routing Phase 4 (D5/D13): doubly-opt-in staged dispatch. `workflowFor`
      // is a PURE predicate over the already-in-hand issue+config — undefined ⇒ fall
      // through to the UNCHANGED single-agent path below (SC4). The branch sits AFTER
      // ensureWorkspace + the claim, so the workflow reuses the ONE worktree (D11) and
      // SC5's "one claim" holds. When it fires, the engine owns the terminal transition
      // via the settle callbacks; we return without touching the single-agent path.
      const workflowMatch = workflowFor(issue, this.config);
      if (workflowMatch) {
        // `workflowFor` is the single match authority: it returns BOTH the plan AND
        // the matched decl's optional stageDeadlineMs (D12). No re-matching here.
        const workflowPlan = workflowMatch.plan;
        const ctx = buildWorkflowContext({
          recorder: this.recorder,
          logger: this.logger,
          issue,
          workspacePath,
          maxTurns: this.config.agent.maxTurns,
          backendFactory: this.backendFactory,
          // this.adaptiveRouter.route returns { decision, def }; the engine reads only
          // { decision } — structurally compatible with the narrow router dep.
          adaptiveRouter: this.adaptiveRouter,
          routingDefault: (() => {
            const d = this.config.agent.routing?.default;
            return d !== undefined ? toArray(d)[0] : undefined;
          })(),
          // per-phase routing: the backends map lets the context resolve a routed
          // stage's locality so local-endpoint stages render the local-indirection
          // prompt. Absent (legacy single-backend config) ⇒ non-local (SC3).
          ...(this.config.agent.backends !== undefined
            ? { backends: this.config.agent.backends }
            : {}),
          ...(workflowMatch.stageDeadlineMs !== undefined
            ? { stageDeadlineMs: workflowMatch.stageDeadlineMs }
            : {}),
          // On a staged retry after a gate block, thread the prior gate/verify
          // reason into the per-stage prompts. The single-agent path does this at
          // orchestrator.ts:2597, but the staged path renders fresh stage prompts
          // and would otherwise DROP it — leaving the executor blind to why the
          // last attempt was blocked (root cause of staged-local non-convergence).
          ...(this.priorGateFailureByIssue.get(issue.id) !== undefined
            ? { priorGateFailure: this.priorGateFailureByIssue.get(issue.id)! }
            : {}),
          // Resume-from-failed-stage: reuse `checkpoint: true` stages (design) across
          // gate-block re-dispatches so execution retries against a FIXED spec/plan.
          loadStageCheckpoint: (u: string) => this.stageCheckpoints.get(u),
          saveStageCheckpoint: (u: string, i: number, run: StageRun) => {
            const m = this.stageCheckpoints.get(u) ?? new Map<number, StageRun>();
            m.set(i, run);
            this.stageCheckpoints.set(u, m);
          },
          // staged-verify-gate-convergence (blocking fix): thread THIS dispatch's
          // `workspacePath` + `issue` into the settle callbacks. On a staged RETRY
          // re-dispatch the tick does NOT recreate the running entry (retry_fired →
          // claim effect → this branch, with the entry-creating claimAndDispatch
          // bypassed), so `settleWorkflowSuccess` cannot recover the workspace from
          // the entry. The closure supplies both on EVERY attempt, so the acceptance
          // gate re-fires across real retries instead of hollow-succeeding (SC2/SC6).
          settleSuccess: (u, r) => this.settleWorkflowSuccess(u, r, workspacePath, issue),
          settleTerminal: (u, r, s, e) => this.settleWorkflowTerminal(u, r, s, e),
        });
        // Record the plan on the running entry (D11 in-memory cursor; the stall
        // bypass reads `entry.workflow`) WHEN it exists. On a within-run retry the
        // entry is absent (the claim effect re-dispatches without re-seeding it) —
        // #890 REUSES the preserved worktree, so the accumulated work persists across
        // attempts; the settle gate keys on the closure-threaded workspacePath above,
        // not on this entry.
        const entry = this.state.running.get(issue.id);
        if (entry) {
          this.state.running.set(issue.id, { ...entry, workflow: workflowPlan, workspacePath });
        }
        // Fire-and-forget like runAgentInBackgroundTask; the engine drives the single
        // terminal transition via the settle callbacks above.
        void executeWorkflow(ctx, workflowPlan);
        return;
      }

      // 5. Resolve the routed backend NAME up front so the LiveSession
      //    + recorder are labelled with it (Spec 2 P2-I2). Reading
      //    `this.config.agent.backend` directly returns `undefined` for
      //    pure-modern configs (only `agent.backends` set), which would
      //    surface as `undefined` in dashboard telemetry + stream
      //    metadata. The router's `resolveName` is total: post-migration
      //    every `routing` slot maps to a known backend in `backends`.
      const useCase = buildRoutingUseCase(issue, backend, this.skillCatalog);

      // Spec B Phase 3 (D7 / F4): one-shot invocation override via env
      // hint. `harness skill run <name> --backend <name>` emits a
      // preamble that exports HARNESS_BACKEND_OVERRIDE; this branch
      // picks it up at the single dispatch about to follow, then the
      // orchestrator continues routing normally for subsequent
      // dispatches.
      const invocationOverride = process.env.HARNESS_BACKEND_OVERRIDE;
      const routerOpts = invocationOverride ? { invocationOverride } : undefined;
      if (invocationOverride) {
        this.logger.info(
          `Spec B Phase 3: HARNESS_BACKEND_OVERRIDE='${invocationOverride}' taking effect for ${issue.identifier}`,
          { issueId: issue.id }
        );
      }

      // AMR Phase 4 (dispatch swap): when an AdaptiveRouter is constructed
      // (routing.policy present) AND neither the test override nor the
      // HARNESS_BACKEND_OVERRIDE env hint is active, route live dispatch through
      // AdaptiveRouter.route() — it classifies, derives+escalation-floors the
      // required tier, and picks the cheapest qualifying backend. The result is
      // resolved ONCE here and reused for both the routed name and the
      // AgentBackend materialization below. When adaptiveRouter === null (no
      // policy) or an override is active, this stays undefined and the EXISTING
      // branches run unchanged — the byte-identical-when-off guarantee (SC8/SC17).
      let amrDecision: RoutingDecision | undefined;
      if (
        this.adaptiveRouter !== null &&
        this.overrideBackend === null &&
        invocationOverride === undefined
      ) {
        const req: RoutingRequest = {
          useCase,
          coherenceUnit: issue.id, // one issue = one coherence unit (D6 pinning at issue grain)
          // Live classification (final-review finding #2): pass the PRE-DIFF text
          // signals the orchestrator actually knows about this unit (title/desc
          // length, spec attached, measurable acceptance). The classify seam runs
          // the real cascade over these; no req.complexity ⇒ route() awaits
          // classifySafe (D4). Diff-based signals stay absent by design (S3-001).
          taskText: buildTaskText(issue),
        };
        const routed = await this.adaptiveRouter.route(req);
        amrDecision = routed.decision;
      }

      let routedBackendName: string;
      if (this.overrideBackend !== null) {
        routedBackendName = this.overrideBackend.name;
      } else if (amrDecision !== undefined) {
        routedBackendName = amrDecision.backendName;
      } else if (this.backendFactory !== null) {
        routedBackendName = this.backendFactory.resolveName(useCase, routerOpts);
      } else {
        // Legacy-fallback path: factory absent because migration threw.
        // Pre-Spec-B configs that have `agent.backend` set without
        // `agent.backends` reach here. routing.default may be
        // RoutingValue (scalar OR chain); we take the first chain
        // entry without availability filtering (validateReferences
        // would have caught typos at construction time).
        //
        // Spec B Phase 1 (closes Phase 0 review finding I1 part 2):
        // the inline Array.isArray normalization is replaced with the
        // canonical toArray helper from backend-router.ts.
        const routingDefault = this.config.agent.routing?.default;
        const routingDefaultScalar =
          routingDefault !== undefined ? toArray(routingDefault)[0] : undefined;
        routedBackendName = routingDefaultScalar ?? this.config.agent.backend ?? 'unknown';
      }

      // 4. Render prompt (moved after backend-name resolution — Phase 1).
      // The template is now backend-aware: a local/pi dispatch renders the
      // bash-shaped local template, everything else renders the default.
      const renderedPrompt = await this.renderer.render(
        this.resolvePromptTemplate(routedBackendName),
        {
          issue,
          attempt: attempt || 1,
        }
      );

      // Phase 2 (Option C, SC3): on a re-dispatch after a local gate failure,
      // thread the prior failure reason into the prompt as a preamble (the
      // re-prompt). The renderer is LiquidJS with `strictVariables: true`, which
      // would throw on an unknown `{{ priorGateFailure }}` template var — so we
      // append the preamble to the ALREADY-rendered string (template-agnostic,
      // no strict-variable risk). Consume-and-clear so it only affects the very
      // next attempt for this issue.
      const priorGateFailure = this.priorGateFailureByIssue.get(issue.id);
      const prompt =
        priorGateFailure !== undefined
          ? `${renderedPrompt}\n\n## Previous attempt failed the enforced gate\n\nYour prior attempt was blocked by the harness gate and re-dispatched. Fix the following before shipping:\n\n${priorGateFailure}\n`
          : renderedPrompt;
      if (priorGateFailure !== undefined) {
        this.priorGateFailureByIssue.delete(issue.id);
      }

      // 6. Start agent session (in background)
      const session: LiveSession = {
        sessionId: `pending-${Date.now()}`,
        backendName: routedBackendName,
        agentPid: null,
        startedAt: new Date().toISOString(),
        lastEvent: 'Dispatching',
        lastTimestamp: new Date().toISOString(),
        lastMessage: null,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        lastReportedInputTokens: 0,
        lastReportedOutputTokens: 0,
        lastReportedTotalTokens: 0,
        turnCount: 0,
      };

      const entry = this.state.running.get(issue.id);
      if (entry) {
        this.state.running.set(issue.id, {
          ...entry,
          workspacePath,
          phase: 'LaunchingAgent',
          session,
          // D10/SC16: capture the AMR-resolved tier so a later quality outcome
          // can climb the escalation floor for this coherence unit (issue).
          ...(amrDecision?.tierRequired !== undefined
            ? { lastRoutedTier: amrDecision.tierRequired }
            : {}),
        });
      }

      // Record session start with the routed backend name (P2-I2).
      this.recorder.startRecording(
        issue.id,
        issue.externalId ?? null,
        issue.identifier,
        routedBackendName,
        attempt ?? 1,
        issue.title
      );

      // Spec 2 SC27 / SC30 / Task 12: build the AgentBackend per-dispatch
      // by translating the legacy `backend` parameter into a
      // `RoutingUseCase`, then asking the factory to materialize.
      // `overrideBackend` (test-only) short-circuits the factory so
      // existing MockBackend-injection tests continue to bypass routing.
      // Eliminating the legacy `backend?: 'local' | 'primary'` parameter
      // entirely is a Phase 4+ cleanup once all callers migrate to
      // passing a `RoutingUseCase` directly.
      let agentBackend: AgentBackend;
      if (this.overrideBackend !== null) {
        agentBackend = this.overrideBackend;
      } else if (amrDecision !== undefined && this.backendFactory !== null) {
        // AMR Phase 4: materialize the router-chosen backend via the factory,
        // passing the AMR name as an invocationOverride so the factory's
        // local/pi resolver + container wrapping still apply. The factory
        // re-resolves the (now-overridden) name — same emit shape as the
        // default-off resolveName+forUseCase pair, so no net emit regression.
        agentBackend = this.backendFactory.forUseCase(useCase, {
          invocationOverride: amrDecision.backendName,
        });
      } else if (this.backendFactory !== null) {
        agentBackend = this.backendFactory.forUseCase(useCase, routerOpts);
      } else {
        // Legacy fallback: migration failed, no override supplied. Fail
        // dispatch the same way the deleted `createBackend()` legacy
        // path would have at runtime.
        throw new Error(
          `Cannot dispatch ${issue.identifier}: agent.backends not synthesized (migration failed) and no override backend supplied. Migrate to agent.backends/agent.routing per docs/guides/multi-backend-routing.md.`
        );
      }
      const activeRunner = new AgentRunner(agentBackend, {
        maxTurns: this.config.agent.maxTurns,
      });
      this.runAgentInBackgroundTask(
        issue,
        workspacePath,
        prompt,
        attempt,
        activeRunner,
        routedBackendName
      );
    } catch (error) {
      // AMR finding #3 + live-wiring review blocker: a fail-closed PrivacyNoMatch
      // (RoutingError code 'privacy-no-match') from AdaptiveRouter.route() is NOT a
      // transport/runner failure — it must surface as a DISTINCT routing:no-tier-match
      // steward escalation, never lumped into the generic dispatch/transport bucket
      // and never fed to the escalation breaker. It is ALSO deterministic
      // (config-driven privacyFloor/allowlist — it CANNOT succeed on re-dispatch), so
      // it must be TERMINAL: `handleRoutingFailure` claims it, queues exactly ONE
      // needs-human escalation, and drives the unit to the terminal `canceled` lane
      // WITHOUT going through `emitWorkerExit('error')` (whose state-machine error
      // branch would enqueue a retry and re-run the same fail-closed route → an
      // escalate-then-retry loop up to `maxRetries` times). Returning here means no
      // transport double-count, no escalation-state feed, and no retry.
      if (await this.handleRoutingFailure(issue, error)) {
        return;
      }
      this.logger.error(`Dispatch failed for ${issue.identifier}`, { error: String(error) });
      await this.emitWorkerExit(issue.id, 'error', attempt, String(error));
    }
  }

  private async processAgentEvent(
    issue: Issue,
    event: import('@harness-engineering/types').AgentEvent
  ): Promise<void> {
    this.logger.info(`Received event from ${issue.identifier}: ${event.type}`);

    // Record event to JSONL stream
    const runEntry = this.state.running.get(issue.id);
    this.recorder.recordEvent(issue.id, runEntry?.attempt ?? 1, event);

    const updateEvent: OrchestratorEvent = {
      type: 'agent_update',
      issueId: issue.id,
      event,
    };
    const { nextState, effects } = applyEvent(this.state, updateEvent, this.config);
    this.state = nextState;

    for (const effect of effects) {
      await this.handleEffect(effect);
    }

    this.emit('agent_event', { issueId: issue.id, event });
    this.emit('state_change', this.getSnapshot());
  }

  private async awaitRateLimitClearance(identifier: string): Promise<void> {
    while (true) {
      const waitTime = computeRateLimitDelay(this.state, this.state);
      if (waitTime <= 0) return;
      this.logger.info(`Rate limit throttling active, pausing ${identifier} for ${waitTime}ms`);
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }

  private runAgentInBackgroundTask(
    issue: Issue,
    workspacePath: string,
    prompt: string,
    attempt: number | null,
    runner: AgentRunner,
    // Phase 2 (Option C): the resolved backend name, so the completion path can
    // run the LOCAL-ONLY enforced gate (`runLocalWorkflowGate`) before treating
    // a normal exit as terminal. Defaults to the running entry's session name
    // when omitted (backward-compatible for the few callers that don't pass it).
    routedBackendName?: string
  ): void {
    // Spec 2 SC30 / Task 12: `runner` is now required. The previous
    // `runner ?? this.runner` fallback is gone with the field removal.
    const activeRunner = runner;
    const gateBackendName =
      routedBackendName ?? this.state.running.get(issue.id)?.session?.backendName;
    this.logger.info(`Starting background task for ${issue.identifier}`);

    // Create abort controller for this issue so stopIssue() can cancel it.
    // PID starts null and is updated when the session reports agentPid.
    const abortController = new AbortController();
    this.abortControllers.set(issue.id, { controller: abortController, pid: null });

    (async () => {
      try {
        this.logger.info(`Calling runner.runSession for ${issue.identifier}`);
        const sessionGen = activeRunner.runSession(issue, workspacePath, prompt);
        for await (const event of sessionGen) {
          // Check if this issue was stopped via stopIssue()
          if (abortController.signal.aborted) {
            this.logger.info(`Agent session aborted for ${issue.identifier}`);
            break;
          }
          // Propagate agent PID from session_started events so stopIssue can SIGTERM it
          if (event.type === 'session_started' && event.content) {
            const pid = (event.content as { pid?: number }).pid;
            if (pid) {
              const tracked = this.abortControllers.get(issue.id);
              if (tracked) tracked.pid = pid;
            }
          }
          await this.processAgentEvent(issue, event);
          if (event.type === 'turn_start') {
            await this.awaitRateLimitClearance(issue.identifier);
          }
        }
        this.logger.info(`Session generator finished for ${issue.identifier}`);
        const afterRunResult = await this.hooks.afterRun(workspacePath);
        if (!afterRunResult.ok) {
          this.logger.warn(
            `afterRun hook failed for ${issue.identifier}: ${afterRunResult.error.message}`
          );
        }
        if (abortController.signal.aborted) {
          // Only emit worker exit if the issue is still tracked in state.
          // stall_detected already processes the state transition and effects —
          // firing emitWorkerExit again would cause double-escalation.
          if (this.state.running.has(issue.id)) {
            await this.emitWorkerExit(issue.id, 'error', attempt, 'Stopped by reconciliation');
          }
        } else {
          await this.finalizeNormalCompletion(issue, workspacePath, attempt, gateBackendName);
        }
      } catch (error) {
        this.logger.error(`Agent runner failed for ${issue.identifier}`, { error: String(error) });
        // Best-effort afterRun even on failure
        const afterRunResult = await this.hooks.afterRun(workspacePath);
        if (!afterRunResult.ok) {
          this.logger.warn(
            `afterRun hook failed for ${issue.identifier}: ${afterRunResult.error.message}`
          );
        }
        await this.emitWorkerExit(issue.id, 'error', attempt, String(error));
      } finally {
        this.abortControllers.delete(issue.id);
      }
    })().catch((err) => {
      this.logger.error('Fatal error in background task', { error: String(err) });
    });
  }

  /**
   * local-backend-full-workflow Phase 2 (Option C): the normal-exit completion
   * seam, extracted so the enforced-gate loop is directly testable. Runs the
   * LOCAL-ONLY enforced gate BEFORE the exit is treated as terminal; a red gate
   * routes through the SHIPPED `emitWorkerExit('error', …)` retry branch — the
   * re-dispatch IS the re-prompt (the next render threads the failure preamble),
   * and `checkRetryBudget` exhaustion queues `needs-human`. On a green gate (or a
   * non-local backend, where the gate is a no-op `{ ok: true }`), the existing
   * Claude/AMR verdict feeders run and the run completes normally — composition,
   * not replacement.
   */
  private async finalizeNormalCompletion(
    issue: Issue,
    workspacePath: string,
    attempt: number | null,
    gateBackendName: string | undefined
  ): Promise<void> {
    const gate =
      gateBackendName !== undefined
        ? // B3: the VERIFY sub-gate is fail-CLOSED (a gate that can't run blocks +
          // re-dispatches). The outcome-eval sub-gate is fail-OPEN by design — an
          // unreachable eval provider (incl. a workflowGates:'primary' backend that's
          // down) degrades to a neutral verdict rather than wedging EVERY local
          // dispatch; the verify gate remains the hard safety floor.
          await this.runLocalWorkflowGate(issue, workspacePath, gateBackendName)
        : ({ ok: true } as const);
    if (!gate.ok) {
      // INVARIANT: safe to stash this failure for the NEXT render only because
      // routing is issue-deterministic (taskText = buildTaskText(issue), stable
      // across attempts) — the re-dispatch resolves to the SAME local backend, so
      // the preamble is read back into a local template, never a Claude prompt. If
      // routing ever becomes attempt-sensitive or hot-reloadable mid-issue, gate
      // the read (orchestrator.ts:2185) on the re-render's resolved backend type.
      this.priorGateFailureByIssue.set(issue.id, gate.reason);
      this.recordFlightVerdict({
        issueId: issue.id,
        identifier: issue.identifier,
        verdict: 'gate-blocked',
        attempt,
        gateReason: gate.reason,
      });
      this.logger.info(`local workflow gate blocked ${issue.identifier}; re-dispatching (SC3)`, {
        issueId: issue.id,
      });
      await this.emitWorkerExit(issue.id, 'error', attempt, gate.reason);
      return;
    }

    // Phase 4: run BOTH verdict sources UNCONDITIONALLY, then combine. The
    // retrospective is a SIBLING verdict source to the 4c quality feeder,
    // guarded identically (AMR off / feature off ⇒ no-op). Either verdict
    // returning 'quality-fail' escalates the coherence unit; a mispredict is as
    // much a quality failure as a security defect. On the local path this
    // COMPOSES with the gate above (the gate already blocked a red build; these
    // feeders remain a second layer for the accepted green run).
    //
    // We must NOT short-circuit `quality ?? retro`: the retrospective's side
    // effect (`recordTriageOutcome`, feeding the precedent store the ratchet
    // reads) is what accrues a shape's mispredict evidence. A change that is BOTH
    // a security defect AND a triage mispredict would otherwise record NO graded
    // outcome — that bad shape would never accrue the evidence that keeps its
    // ratchet at stage 1. The retrospective is fully guarded and idempotent, so
    // running it on a security-failing unit is safe. Escalation is unchanged:
    // either source ⇒ 'quality-fail' ⇒ escalate (the `??` still surfaces it). The
    // retrospective annotates the PR on a match (best-effort, inside the method).
    const qualityClass = await this.deriveSingleAgentQualityVerdict(issue, workspacePath);
    const retroClass = await this.deriveRoutingRetrospectiveVerdict(issue, workspacePath);
    const outcomeClass = qualityClass ?? retroClass;
    await this.emitWorkerExit(issue.id, 'normal', attempt, undefined, outcomeClass);
  }

  /**
   * local-backend-full-workflow Phase 2 (Option C): the LOCAL-ONLY enforced
   * gate. For a `pi`/`local` dispatch it runs the mechanical gate (verify =
   * typecheck+lint+test via the injected `verifyRunner`) and, on green, the
   * outcome evaluation (Task 7) against the workspace branch; a red result returns a
   * blocking `{ ok: false, reason }`. The completion path routes that reason
   * through `emitWorkerExit('error', …)` so the shipped state-machine retry
   * branch re-dispatches (the re-prompt) rather than marking the run complete.
   *
   * NON-local backends (Claude/AMR) get an unconditional `{ ok: true }` — this
   * gate never touches their completion path (D2 scopes enforcement to the
   * local path only; the AMR verdict feeders keep their existing behavior).
   *
   * Fully guarded: any thrown error → a CONSERVATIVE block `{ ok: false,
   * reason: 'gate error: …' }`, mirroring the shipped fail-safe pattern — a
   * gate that cannot run is treated as red (re-dispatch), never as a silent
   * pass that could ship a bad build.
   */
  private async runLocalWorkflowGate(
    issue: Issue,
    workspacePath: string,
    backendName: string,
    /**
     * staged-verify-gate-convergence D2: an operator-declared acceptance command
     * (from the matched `StagedWorkflowDecl.acceptance`). When present it is the
     * mechanical step (run in the workspace, gated on exit code) IN PLACE OF
     * `verifyRunner`; when absent, `verifyRunner` is unchanged. The empty-diff halt
     * in step 0 and the outcome-eval stage in step 2 run identically either way.
     */
    acceptance?: string
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const def = this.config.agent.backends?.[backendName];
    // isLocalExecutionBackend (not …Endpoint): a `codex` stage also lands its change
    // in the worktree and MUST go through this enforced gate — codex can report a
    // hollow success, so the gate is the safety net that catches it.
    const isLocal = def !== undefined && isLocalExecutionBackend(def);
    if (!isLocal) return { ok: true };

    try {
      // 0. Empty-diff halt (Blocker 2b): if the agent produced NO workspace
      //    changes it implemented nothing — an empty diff would trivially pass
      //    `verify` (typecheck/lint/test of an unchanged tree) and be marked
      //    done. Short-circuit BEFORE verify so nothing-implemented never ships.
      const diff = await this.diffRunner(workspacePath);
      if (!diff.hasChanges) {
        return {
          ok: false,
          reason: 'no changes produced — the agent completed without implementing anything',
        };
      }

      // 1. Mechanical gate. D2: when the matched decl declares an `acceptance`
      //    command, run THAT (in-workspace, gated on exit code) as the mechanical
      //    step; otherwise the default project gate (verify = typecheck+lint+test).
      if (acceptance !== undefined) {
        const result = await this.acceptanceRunner(workspacePath, acceptance);
        if (!result.ok) {
          return {
            ok: false,
            reason: `acceptance command failed:\n${distillGateFailure(result.output)}`,
          };
        }
      } else {
        const verify = await this.verifyRunner(workspacePath);
        if (!verify.ok) {
          return {
            ok: false,
            reason: `verify failed:\n${distillGateFailure(verify.output)}`,
          };
        }
      }

      // 1b. Doc-coverage gate: verify (typecheck+lint+test) is narrower than a real
      //     ship — a new public module (e.g. a new ESLint rule) passes it yet fails the
      //     repo's doc-drift check in real CI. Block a change that ADDS a source file not
      //     referenced under docs/, so the reasoner→coder loop produces ship-ready docs.
      //     Fail-open inside the runner: a scan error never spuriously blocks.
      const docCoverage = await this.docCoverageRunner(workspacePath);
      if (!docCoverage.ok) {
        return { ok: false, reason: docCoverage.output };
      }

      // 2. Outcome evaluation (SC4): run the SAME OutcomeEvaluator engine the
      //    Claude/AMR path uses — un-gated from the AMR-active + `acceptanceEval.
      //    enabled` requirements (D2: local always evaluates when a spec exists).
      //    `evaluateOutcomeCore` resolves the spec from the roadmap Spec field OR
      //    the conventional docs/changes/<slug>/proposal.md the design stage wrote
      //    (the local model rarely registers the Spec field), and no-ops when
      //    neither a spec nor a provider resolves. A high-confidence NOT_SATISFIED
      //    → `'quality-fail'` → block (same authority as the Claude path).
      const model = this.config.agent.routing?.policy?.acceptanceEval?.model;
      const evalClass = await this.evaluateOutcomeCore(issue, workspacePath, model, 'local');
      if (evalClass === 'quality-fail') {
        return {
          ok: false,
          reason:
            'outcome-eval returned a high-confidence NOT_SATISFIED verdict: the implementation does not satisfy the spec.',
        };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `local workflow gate errored for ${issue.identifier}; blocking conservatively`,
        {
          issueId: issue.id,
          error: msg,
        }
      );
      return { ok: false, reason: `gate error: ${msg}` };
    }
  }

  /**
   * AMR 4c (ADR 0069): the sound single-agent quality-verdict feeder. On a normal
   * exit, when AMR is active, run a BASELINE-RELATIVE security scan of the lines
   * the agent INTRODUCED (only added lines — a pre-existing pattern never counts);
   * a NEW error-severity finding → `'quality-fail'`, which climbs the coherence
   * unit's escalation floor. Success stays `neutral` (returns `undefined`) — a
   * premature `'quality-pass'` would clear accumulating failures (ADR 0069).
   *
   * Fully guarded: any error (git/scan/parse) → `undefined` → `neutral`, so this
   * NEVER breaks completion. No-op (zero cost) when AMR is off, keeping the
   * dispatch path byte-identical. Staged workflows use their own per-stage gate
   * feeder; this is the single-agent equivalent.
   */
  private async deriveSingleAgentQualityVerdict(
    issue: Issue,
    workspacePath: string
  ): Promise<'quality-fail' | undefined> {
    if (this.adaptiveRouter === null) return undefined;
    try {
      const introduced = await this.workspace.getIntroducedDiff(issue.identifier);
      // No introduced (added) lines ⇒ nothing to judge: skip BOTH the security scan
      // and the acceptance-eval. A pure-deletion / no-op change is therefore not
      // spec-checked — deliberate (a NOT_SATISFIED on an empty added-line set is
      // low-value and this matches the security feeder's boundary); do NOT "fix"
      // this into a path that runs the eval on an empty diff.
      if (introduced.length === 0) return undefined;
      const scanner = new SecurityScanner();
      scanner.configureForProject(workspacePath);
      if (hasIntroducedSecurityDefect(introduced, scanner)) {
        this.logger.info('amr:quality-fail — agent introduced an error-severity security finding', {
          issueId: issue.id,
        });
        return 'quality-fail';
      }
      // Opt-in LLM spec-satisfaction verdict (4c v2). Only reached when the cheap
      // security scan is clean, so a defect never wastes a model call.
      return await this.deriveAcceptanceEvalVerdict(issue, workspacePath);
    } catch (err) {
      this.logger.debug('amr quality verdict skipped (best-effort)', {
        issueId: issue.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return undefined;
  }

  /**
   * AMR 4c v2: opt-in LLM spec-satisfaction verdict. Gated on
   * `routing.policy.acceptanceEval.enabled` (HEAVY — one model call + latency per
   * exit, so separate from the always-on cheap security scan), a present spec, and
   * an available analysis provider. Runs the shared `OutcomeEvaluator` over the
   * introduced diff vs the spec's judgment section, reusing the SEL-layer provider
   * the live classifier already builds; a BLOCKING verdict (high-confidence
   * NOT_SATISFIED) → `'quality-fail'`. Conservative + fully guarded: no
   * spec / no provider / empty diff / any error → `undefined` (neutral). The mapper
   * only ever emits the negative, so success can never become a premature
   * `'quality-pass'`. An absent GraphStore falls back to an ephemeral one — the
   * evaluator's `execution_outcome` persistence is best-effort and never blocks.
   */
  private async deriveAcceptanceEvalVerdict(
    issue: Issue,
    workspacePath: string
  ): Promise<'quality-fail' | undefined> {
    const acceptanceEval = this.config.agent.routing?.policy?.acceptanceEval;
    // AMR/Claude path gating stays here: opt-in via `acceptanceEval.enabled`.
    if (acceptanceEval?.enabled !== true || issue.spec === null) return undefined;
    return this.evaluateOutcomeCore(issue, workspacePath, acceptanceEval.model, 'amr');
  }

  /**
   * local-backend-full-workflow Phase 2 (Option C, SC4): the SHARED outcome-eval
   * core, lifted out of `deriveAcceptanceEvalVerdict` so BOTH callers reuse the
   * same `OutcomeEvaluator` engine over the introduced diff vs the spec's
   * judgment section. It does NOT gate on `adaptiveRouter !== null` or
   * `acceptanceEval.enabled` — those guards live in the AMR caller above; the
   * LOCAL gate (D2) always evaluates when a spec is present. Maps a
   * high-confidence NOT_SATISFIED to `'quality-fail'`; conservative + fully
   * guarded: no spec / no provider / empty diff / any error → `undefined`.
   */
  /**
   * local-backend-full-workflow Phase 3 (D5/SC6): resolve the AnalysisProvider
   * for the outcome-eval gate. Caller-gated: ONLY the LOCAL gate caller consults
   * `agent.routing.workflowGates`. The AMR caller ALWAYS uses local SEL
   * (`resolveComplexityProvider`) so the AMR acceptance-eval path is byte-identical
   * (SC-neutral). When `workflowGates === 'primary'` on the local caller, resolve
   * from the primary (routing.default) backend; any miss degrades to local SEL
   * (fail-open — an unreachable stronger provider must NOT wedge the local gate;
   * see the fail-open note at the runLocalWorkflowGate call site).
   */
  private resolveOutcomeEvalProvider(caller: 'amr' | 'local'): AnalysisProvider | undefined {
    if (caller === 'local' && this.config.agent.routing?.workflowGates === 'primary') {
      return this.resolvePrimaryOutcomeEvalProvider() ?? this.resolveComplexityProvider();
    }
    const intelligenceProvider = this.resolveComplexityProvider();
    if (intelligenceProvider !== undefined) return intelligenceProvider;
    // The outcome-eval gate is a distinct concern from the intelligence PIPELINE
    // (CML/PESL). A fully-local run wants the gate's spec-vs-diff judgment even with
    // `intelligence.enabled: false`, so fall back to the reasoner provider derived at
    // startup (HARNESS_ANALYSIS_*, see analysis-env). Local caller only — the AMR
    // path keeps its configured provider.
    return caller === 'local' ? this.resolveLocalAnalysisEnvProvider() : undefined;
  }

  /**
   * The reasoner `AnalysisProvider` from the startup-derived analysis env
   * ({@link applyAnalysisEnv}). Lets the local outcome-eval gate judge on-device
   * without the full intelligence pipeline. Undefined when no analysis endpoint is
   * configured (⇒ the gate degrades to advisory, exactly as before).
   */
  private resolveLocalAnalysisEnvProvider(): AnalysisProvider | undefined {
    const baseUrl = process.env.HARNESS_ANALYSIS_BASE_URL?.trim();
    if (baseUrl === undefined || baseUrl === '') return undefined;
    const model = process.env.HARNESS_ANALYSIS_MODEL?.trim();
    return new OpenAICompatibleAnalysisProvider({
      apiKey: process.env.HARNESS_ANALYSIS_API_KEY?.trim() || 'ollama',
      baseUrl,
      ...(model ? { defaultModel: model } : {}),
    });
  }

  /**
   * Build an AnalysisProvider from the PRIMARY (routing.default) backend for the
   * Phase-3 `workflowGates:'primary'` seam. Reuses the shipped
   * `buildAnalysisProvider` translator but forces the router to the default
   * backend. Returns undefined (→ caller degrades to local SEL) when intelligence
   * is disabled, the factory is absent, or the default backend cannot produce a
   * provider — fully guarded, never throws.
   */
  private resolvePrimaryOutcomeEvalProvider(): AnalysisProvider | undefined {
    try {
      if (!this.config.intelligence?.enabled || !this.backendFactory) return undefined;
      const backends = this.config.agent.backends;
      // The "primary" backend is routing.default (a RoutingValue: scalar name or
      // a fallback chain). The shipped BackendRouter has NO { kind: 'default' }
      // query — it falls back to routing.default internally — so read it directly
      // and take the first entry when it's a chain (the primary backend name).
      const def0 = this.config.agent.routing?.default;
      const defaultName = Array.isArray(def0) ? def0[0] : def0;
      if (defaultName === undefined) return undefined;
      const def = backends?.[defaultName];
      if (!def) return undefined;
      return (
        buildAnalysisProvider({
          def,
          backendName: defaultName,
          layer: 'sel',
          getResolverStatusSnapshot: () => {
            const resolver = this.localResolvers.get(defaultName);
            if (!resolver) return null;
            const s = resolver.getStatus();
            return {
              available: s.available,
              resolved: s.resolved,
              configured: s.configured,
              detected: s.detected,
            };
          },
          intelligence: this.config.intelligence,
          logger: this.logger,
        }) ?? undefined
      );
    } catch {
      return undefined;
    }
  }

  /**
   * Resolve an {@link AnalysisProvider} bound to the REASONER (thinking) backend —
   * `routing.modes.thinking`, the model used for design/plan/review. Mirrors
   * {@link resolvePrimaryOutcomeEvalProvider} but targets the thinking backend and does
   * NOT require the intelligence pipeline to be enabled (a local ollama provider only
   * needs its model loaded). Returns the provider + its name, or undefined (→ no
   * advisory) when unconfigured/unavailable. Guarded; never throws.
   */
  private resolveReasonerProvider(): { provider: AnalysisProvider; name: string } | undefined {
    try {
      if (!this.backendFactory) return undefined;
      const thinking = this.config.agent.routing?.modes?.thinking;
      const name = Array.isArray(thinking) ? thinking[0] : thinking;
      if (name === undefined || name === '') return undefined;
      const def = this.config.agent.backends?.[name];
      if (!def) return undefined;
      // Floor the timeout for the reasoner advisory: a thinking reasoner over /v1 needs
      // minutes to answer, far longer than the general SEL classify budget (which killed
      // it mid-think in af8). Never shorten a larger operator-configured value.
      const intel: IntelligenceConfig = {
        ...(this.config.intelligence ?? { enabled: false }),
        requestTimeoutMs: Math.max(
          this.config.intelligence?.requestTimeoutMs ?? 0,
          REASONER_UNSTICK_TIMEOUT_MS
        ),
      };
      const provider =
        buildAnalysisProvider({
          def,
          backendName: name,
          layer: 'sel',
          getResolverStatusSnapshot: () => {
            const resolver = this.localResolvers.get(name);
            if (!resolver) return null;
            const s = resolver.getStatus();
            return {
              available: s.available,
              resolved: s.resolved,
              configured: s.configured,
              detected: s.detected,
            };
          },
          intelligence: intel,
          logger: this.logger,
        }) ?? undefined;
      if (provider === undefined) return undefined;
      return { provider, name };
    } catch {
      return undefined;
    }
  }

  /**
   * Unload the coder (execution model) from Ollama so the reasoner unstick call has a
   * free GPU (see {@link resolvePeerUnloadTarget}). Best-effort and never throws — a
   * miss just leaves the coder resident and the reasoner call takes its chances.
   */
  private async unloadPeerModelBestEffort(): Promise<void> {
    try {
      const target = resolvePeerUnloadFromConfig(this.config.agent);
      if (target === undefined) return;
      await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: target.model, keep_alive: 0 }),
      });
    } catch {
      // Best-effort: an unload failure must never block the advisory.
    }
  }

  /**
   * Reasoner unstick advisory: when the local executor has STALLED (repeated gate
   * failures with retry budget left), ask the thinking model to diagnose the failure
   * and prescribe a concrete fix, returning a preamble to prepend to the coder's next
   * retry feedback. Best-effort — any miss (no reasoner, provider down, bad response)
   * returns undefined so the normal retry proceeds unchanged. Never throws.
   */
  private async maybeReasonerUnstickAdvisory(
    issue: Issue,
    gateReason: string,
    attempts: number,
    bound: number
  ): Promise<string | undefined> {
    const thinking = this.config.agent.routing?.modes?.thinking;
    const reasonerBackendName = Array.isArray(thinking) ? thinking[0] : thinking;
    const assistAfter = Math.min(DEFAULT_REASONER_ASSIST_AFTER, Math.max(1, bound - 1));
    if (!shouldRequestUnstickAdvice({ attempts, bound, assistAfter, reasonerBackendName })) {
      return undefined;
    }
    const resolved = this.resolveReasonerProvider();
    if (resolved === undefined) return undefined;
    // Free the GPU before the reasoner call: on a single-GPU box the just-finished
    // coder is still resident, and swapping it out under load starves the reasoner
    // request past its budget (cx4–cx7: advisory timed out + skipped every time).
    // Explicitly unload the coder so the reasoner loads into free VRAM. Best-effort.
    await this.unloadPeerModelBestEffort();
    try {
      let diffText = '';
      try {
        diffText = await this.workspace.getIntroducedDiffText(issue.identifier);
      } catch {
        diffText = '';
      }
      const taskText = `${issue.title}\n${issue.description ?? ''}`;
      const prompt = buildUnstickPrompt({ taskText, gateReason, diffText });
      const resp = await resolved.provider.analyze<UnstickAdvice>({
        prompt,
        systemPrompt: UNSTICK_SYSTEM_PROMPT,
        responseSchema: UNSTICK_SCHEMA,
        // disableThinking → the provider's fast native `/api/chat think:false` path.
        // We originally left thinking ON ("let the reasoner think"), but over Ollama's
        // `/v1` a thinking Qwen3.6 producing structured output takes ~60s WARM and far
        // longer cold/contended (codex holding the coder model) — so it blew the timeout
        // and was skipped EVERY time (observed cx4: 2/2 skipped), delivering nothing.
        // Benchmarked: native think:false answers the same diagnosis in ~6.5s (9× faster)
        // and stays correct on the observed failure modes. A fast diagnosis that ARRIVES
        // beats a perfect one that times out; qwen3.6 (a stronger model than the coder) is
        // a capable diagnostician even without the <think> trace.
        disableThinking: true,
      });
      this.logger.info(
        `reasoner unstick advisory issued for ${issue.identifier} (attempt ${attempts})`,
        {
          issueId: issue.id,
          reasoner: resolved.name,
        }
      );
      return formatUnstickAdvisory(resp.result);
    } catch (err) {
      this.logger.debug(`reasoner unstick advisory skipped (best-effort)`, {
        issueId: issue.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  private async evaluateOutcomeCore(
    issue: Issue,
    workspacePath: string,
    model: string | undefined,
    caller: 'amr' | 'local'
  ): Promise<'quality-fail' | undefined> {
    // Prefer the roadmap-registered Spec; fall back to the conventional
    // docs/changes/<slug>/proposal.md the local design stage writes — the local
    // model often does not register the Spec field, so keying only on `issue.spec`
    // silently skips the gate on every local run. Skip only when neither resolves to
    // a real file on disk (no spec to judge against).
    const specRel = issue.spec ?? documentStagePath('spec', issue.identifier);
    if (specRel === '') return undefined;
    const specPath = path.join(workspacePath, specRel);
    const { existsSync } = await import('node:fs');
    if (!existsSync(specPath)) return undefined;
    const provider = this.resolveOutcomeEvalProvider(caller);
    if (provider === undefined) return undefined;
    try {
      const diff = await this.workspace.getIntroducedDiffText(issue.identifier);
      if (diff.trim() === '') return undefined;
      const evaluator = new OutcomeEvaluator(provider, this.graphStore ?? new GraphStore(), {
        ...(model !== undefined ? { model } : {}),
      });
      const verdict = await evaluator.evaluate({
        specPath,
        diff,
        // No captured test output at the single-agent-exit seam — intentionally
        // omitted (the evaluator judges diff-vs-spec and treats absent test output
        // as weaker evidence → lower confidence, never a false blocking verdict).
        testOutput: '',
      });
      const cls = outcomeVerdictToQualityFail(verdict);
      if (cls === 'quality-fail') {
        this.logger.info(
          `${caller}:quality-fail — acceptance-eval NOT_SATISFIED (high confidence)`,
          {
            issueId: issue.id,
            rationale: verdict.rationale,
          }
        );
      }
      return cls;
    } catch (err) {
      this.logger.debug(`${caller} acceptance-eval skipped (best-effort)`, {
        issueId: issue.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  /**
   * Roadmap Auto-Triage Phase 4 (SC1–SC3, SC5, SC7): the post-diff routing
   * retrospective — a SIBLING quality-verdict source to the 4c feeder above,
   * extending (not replacing) the proven escalation path. On a normal exit, when AMR
   * is live AND auto-triage is enabled AND this unit carries a stored pre-dispatch
   * prediction, it classifies the ACTUAL introduced diff at full strength
   * (phase:'post-diff') and grades it against that prediction:
   *   - MATCH   → records the graded outcome + annotates the PR "AI autonomous —
   *               verify" (stage-2 human-verify handling, SC4) → returns `undefined`
   *               (neutral: a match is not an escalation).
   *   - MISMATCH (diff exceeded prediction, or a missing/garbled prediction, or ANY
   *               error) → records the outcome (when a shape is known) + returns
   *               `'quality-fail'`, which climbs the coherence unit's escalation floor
   *               via `recordAmrOutcome`; exhaustion queues `needs-human` (SC3/SC7).
   *
   * Fail-safe & guarded (SC7): an error never a silent pass — it takes the MISMATCH
   * (block+escalate) path. No-op (byte-identical) when AMR is off, auto-triage is
   * off, or the unit was not dispatched through triage (no stored prediction) — the
   * last means an ordinary non-triaged run is never graded.
   */
  private async deriveRoutingRetrospectiveVerdict(
    issue: Issue,
    _workspacePath: string
  ): Promise<'quality-fail' | undefined> {
    if (this.adaptiveRouter === null) return undefined;
    if (this.config.roadmap?.autoTriage?.enabled !== true) return undefined;
    // The prediction is keyed by the roadmap External-ID (the marker's write key). No
    // external id ⇒ this unit cannot have a stored prediction ⇒ nothing to grade.
    const externalId = issue.externalId;
    if (externalId === null || externalId === '') return undefined;

    // Load the accreting triage records and find this unit's prediction slice.
    let record: eventSourcing.StoredTriageRecord | undefined;
    try {
      const loaded = await eventSourcing.loadTriageRecords(this.projectRoot);
      if (!loaded.ok) throw loaded.error;
      record = loaded.value.find((r) => r.externalId === externalId);
    } catch (err) {
      this.logger.debug('amr retrospective skipped (record load failed)', {
        issueId: issue.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // HARDENING (SC7 — closes the total-IO-failure window): if `issue.spec` is present, the
      // unit carries an INDEPENDENT "this was triaged" signal — the marker attaches the spec at
      // dispatch, and that signal does NOT depend on the (now-failed) store read. A triaged unit
      // whose store we cannot read is a prediction we cannot confirm ⇒ BLOCK+escalate, never a
      // silent pass (a mispredict must not merge just because the store hiccuped). Without a
      // spec we can't distinguish an ordinary non-triaged run from a triaged one, so we must NOT
      // block every run on an IO hiccup ⇒ neutral (the conservative default for un-triaged work).
      if (issue.spec !== null && issue.spec !== undefined && issue.spec !== '') {
        this.logger.info(
          'amr:quality-fail — spec-bearing (triaged) unit but the triage store is unreadable ' +
            '(fail-safe block: a triaged unit whose prediction we cannot read never silently passes)',
          { issueId: issue.id, externalId }
        );
        return 'quality-fail';
      }
      return undefined;
    }

    // Not a triaged unit (no record at all) ⇒ neutral, never graded.
    if (record === undefined) return undefined;

    // A triaged unit WITH a record but WITHOUT a prediction slice is a
    // missing/garbled prediction ⇒ block+escalate (SC7 — never a silent pass).
    const stored = record.prediction;
    if (stored === undefined) {
      this.logger.info(
        'amr:quality-fail — triaged unit has no stored prediction (fail-safe block)',
        {
          issueId: issue.id,
          externalId,
        }
      );
      return 'quality-fail';
    }
    const prediction: TriagePrediction = {
      verdict: stored.verdict,
      levers: stored.levers,
      scopeEstimate: stored.scopeEstimate,
      ratchetStage: stored.ratchetStage,
    };

    try {
      const hunks = await this.workspace.getIntroducedDiff(issue.identifier);
      const taskText = buildTaskText(issue);
      // Wire the operator's comparator threshold from config (SC2). The level-band delta
      // that counts as a mispredict is `thresholds.exceededByBands` (default 1).
      const exceededByBands = this.config.roadmap?.autoTriage?.thresholds?.exceededByBands ?? 1;
      const result = await runRetrospective(
        {
          hunks,
          textOnly: {
            descriptionLength: taskText.descriptionLength,
            specExists: taskText.specExists,
            acceptanceMeasurable: taskText.acceptanceMeasurable,
          },
          prediction,
          riskHigh: false,
          prompt: taskText.prompt,
          comparatorConfig: { exceededByBands },
        },
        this.resolveComplexityProvider()
      );

      // Record the graded outcome to the Phase-0 store (closes the loop; SC5). Keyed by
      // the SAME shapeKey the prediction used so precedent aggregates like-for-like.
      const outcomeInput = buildTriageOutcomeInput(externalId, record.shapeKey, result);
      const recorded = await eventSourcing.recordTriageOutcome(this.projectRoot, outcomeInput);
      if (!recorded.ok) {
        this.logger.warn('amr retrospective outcome record failed (best-effort)', {
          issueId: issue.id,
          error: recorded.error.message,
        });
      }

      if (result.comparison.action === 'block-escalate') {
        this.logger.info('amr:quality-fail — post-diff retrospective mispredict (block+escalate)', {
          issueId: issue.id,
          externalId,
          predicted: prediction.verdict.level,
          actual: result.actual.level,
          exceededBy: result.comparison.exceededBy,
        });
        return 'quality-fail';
      }

      // MATCH ⇒ v1 stage-2 handling: annotate the PR for required human verification.
      await this.annotateRetrospectiveMatch(issue, externalId, result.actual.level);
      return undefined;
    } catch (err) {
      // SC7: any retrospective error takes the MISMATCH (block+escalate) path — an
      // error is never a silent pass. Best-effort logged; still returns the block.
      this.logger.info('amr:quality-fail — post-diff retrospective errored (fail-safe block)', {
        issueId: issue.id,
        externalId,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'quality-fail';
    }
  }

  /**
   * v1 stage-2 match handling (SC4): annotate the unit's PR/issue with a "verify this
   * autonomous change" note so a human reviews every autonomous PR. Best-effort — a
   * missing tracker config / token / a failed comment never breaks completion (the
   * grade already recorded above). Mirrors `postLifecycleComment`'s adapter wiring.
   */
  private async annotateRetrospectiveMatch(
    issue: Issue,
    externalId: string,
    actualLevel: string
  ): Promise<void> {
    try {
      const trackerConfig = loadTrackerSyncConfig(this.projectRoot);
      if (!trackerConfig) return;
      const token = process.env.GITHUB_TOKEN;
      if (!token) return;
      const orchestratorId = await this.orchestratorIdPromise;
      const adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
      const body = [
        `**AI autonomous change — please verify** \`${orchestratorId}\``,
        '',
        'The post-diff retrospective classified this change WITHIN its pre-dispatch',
        `prediction (actual complexity: \`${actualLevel}\`). Under autonomy ratchet`,
        'stage 2, a human must verify every autonomous PR before it merges.',
      ].join('\n');
      const result = await adapter.addComment(externalId, body);
      if (!result.ok) {
        this.logger.warn(`amr retrospective annotation failed for ${issue.identifier}`, {
          error: result.error.message,
        });
      }
    } catch (err) {
      this.logger.debug('amr retrospective annotation skipped (best-effort)', {
        issueId: issue.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Informs the state machine that an agent worker has exited.
   */
  private async emitWorkerExit(
    issueId: string,
    reason: 'normal' | 'error',
    attempt: number | null,
    error?: string,
    /**
     * AMR Phase 4 (D10/SC16): classifies the exit for vertical escalation.
     * - `'neutral'` (default for `reason==='normal'`) → records NOTHING. A normal
     *   runner exit is NOT a quality verdict: gates/review/verify run LATER and are
     *   the authoritative pass/fail. Recording a premature `quality-pass` here would
     *   clear the unit's in-progress escalation failure count and mask accumulating
     *   failures — so a bare normal exit must stay escalation-neutral.
     * - `'quality-pass'` → recordOutcome(ok=true) clears the in-progress failure
     *   count (recovery). Only an EXPLICIT quality verdict may pass this.
     * - `'quality-fail'` → recordOutcome(ok=false) climbs the escalation floor.
     *   (The live gate/outcome-eval fan-in that raises this per coherence unit is
     *   deferred — see docs/changes/adaptive-model-routing/proposal.md "Deferred
     *   follow-ups", Phase 4c.)
     * - `'transport'` (default for `reason==='error'`) → NEVER feeds escalation;
     *   transport/runner failures are the shipped per-model breaker's job (they
     *   must not double-count).
     */
    outcomeClass?: 'quality-pass' | 'quality-fail' | 'transport' | 'neutral'
  ): Promise<void> {
    // D10/SC16: feed quality outcomes into the AMR escalation state. A bare normal
    // exit is NEUTRAL (records nothing — quality is decided by later gates), and
    // transport failures are excluded (breaker's job). Only fires when AMR is live.
    this.recordAmrOutcome(issueId, outcomeClass ?? (reason === 'normal' ? 'neutral' : 'transport'));
    // Phase 4 (DLane-5): worker completion is the authoritative success/failure
    // signal — success→in_review, failure→blocked. Persist BEFORE handing off to
    // the completion handler (whose downstream cleanWorkspace/releaseClaim/escalate
    // effects must not be treated as the completion signal). Best-effort.
    await this.persistLaneSafe(issueId, reason === 'normal' ? 'success' : 'failure');
    await this.completionHandler.handleWorkerExit(issueId, reason, attempt, error, (effect) =>
      this.handleEffect(effect)
    );
    // S1 drain (ADR 0060): a completed run may have freed a local model whose
    // eviction was deferred while it was in use. Best-effort, fire-and-forget —
    // it must never block the completion path.
    void this.drainDeferredEvictions();
    this.emit('state_change', this.getSnapshot());
  }

  /**
   * AMR Phase 4 (D10/SC16): feed a dispatch outcome into vertical escalation.
   * No-op unless an AdaptiveRouter is live (policy present) AND this dispatch was
   * AMR-routed (a `lastRoutedTier` was captured). Transport outcomes never reach
   * `recordOutcome` — the shipped per-model breaker owns those, so the two signals
   * never double-count. The coherence unit is the issue id (D6 issue-grain pinning).
   */
  private recordAmrOutcome(
    issueId: string,
    outcomeClass: 'quality-pass' | 'quality-fail' | 'transport' | 'neutral'
  ): void {
    if (this.adaptiveRouter === null) return;
    if (outcomeClass === 'transport') return; // breaker's job — never escalate
    if (outcomeClass === 'neutral') return; // normal runner exit ≠ quality verdict — record nothing
    const tier = this.state.running.get(issueId)?.lastRoutedTier;
    if (tier === undefined) return; // dispatch was not AMR-routed (override/no policy)
    this.adaptiveRouter.recordOutcome(issueId, tier, outcomeClass === 'quality-pass');
  }

  /**
   * AMR steward-escalation seam (D10, findings item 1 + 2). Queues a `needs-human`
   * interaction for a coherence unit whose routing hard-failed — either the vertical
   * escalation exhausted the `strong` ceiling (`escalation-exhausted`) or the
   * fail-closed selector left no compliant backend (`privacy-no-match`). Both ride
   * the SAME `needs-human` mechanism as every other escalation. The `RoutingError`
   * code disambiguates the two on the steward's channel. The coherence unit is the
   * issue id (D6 issue-grain pinning); title/description are recovered from running
   * state when still present. Fire-and-forget + `.catch` — a queue write must never
   * block or throw out of the dispatch/outcome path.
   */
  private escalateRoutingToHuman(
    coherenceUnit: string,
    error: RoutingError,
    issue?: { identifier?: string; title?: string; description?: string | null }
  ): void {
    // Use the real typed running-entry accessor (`Map<string, RunningEntry>`), not
    // a loose inline cast: a structural cast would silently yield `undefined` if the
    // running-entry / `Issue` shape drifts, quietly degrading the escalation the
    // `onExhausted` path relies on. `entry.issue` is a full `Issue`.
    const entry: RunningEntry | undefined = this.state.running.get(coherenceUnit);
    // Prefer the in-scope issue (dispatch-boundary path has the full object), fall
    // back to running state (the onExhausted path fires from an outcome).
    const issueTitle =
      issue?.title ?? issue?.identifier ?? entry?.issue.title ?? entry?.identifier ?? coherenceUnit;
    const issueDescription = issue?.description ?? entry?.issue.description ?? null;
    void this.interactionQueue
      .push({
        id: `interaction-${randomUUID()}`,
        issueId: coherenceUnit,
        type: 'needs-human',
        reasons: [`routing:${error.code}`, error.message],
        context: {
          issueTitle,
          issueDescription,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: new Date().toISOString(),
        status: 'pending',
      })
      .catch((err) => {
        this.logger.warn(`Failed to queue routing steward escalation for ${coherenceUnit}`, {
          coherenceUnit,
          code: error.code,
          error: String(err),
        });
      });
  }

  /**
   * AMR dispatch-boundary routing-failure handler (finding #3 + live-wiring
   * review blocker). When `AdaptiveRouter.route()` throws a fail-closed
   * `PrivacyNoMatch` (`RoutingError` code `'privacy-no-match'`) at dispatch, that
   * distinct signal MUST NOT be swallowed by the generic transport/dispatch-error
   * path (S4-001): it is not a runner/transport failure, so it must never be
   * recorded as one or feed the vertical escalation breaker. Instead it emits a
   * DISTINCT `routing:no-tier-match` steward escalation (needs-human, same
   * mechanism as `onExhausted`) carrying the coherence unit + reason.
   *
   * It is ALSO deterministic — the `privacyFloor`/allowlist that emptied the
   * candidate set is config-driven, so re-dispatch would throw the SAME
   * `PrivacyNoMatch`. Therefore this path is TERMINAL: it drives the unit to the
   * `canceled` lane and removes it from `running`/`claimed` directly, rather than
   * routing through `emitWorkerExit('error')` (whose state-machine error branch
   * enqueues a retry whenever the retry budget is not yet exhausted — which would
   * re-dispatch, re-fail closed, and re-escalate up to `maxRetries` times). No
   * retry is scheduled, no transport outcome is recorded, and exactly one
   * needs-human escalation is queued. Fail-closed is preserved — `route()` already
   * refused to pick a non-compliant backend, and returning `true` here stops the
   * caller from falling through to any further routing.
   *
   * Returns `true` when the boundary CLAIMED the error (`privacy-no-match` or the
   * hard-cap `budget-exhausted`), so the caller returns without ANY
   * `emitWorkerExit`. Returns `false` for any other error (including
   * `escalation-exhausted`, which the `onExhausted` seam owns) so the generic
   * dispatch-error path runs unchanged.
   */
  private async handleRoutingFailure(
    issue: { id: string; identifier?: string },
    error: unknown
  ): Promise<boolean> {
    // Two fail-closed route() codes ride this terminal steward-escalation path:
    //  - `privacy-no-match`: deterministic (config-driven empty candidate set).
    //  - `budget-exhausted`: `onBudgetExhausted:'human'` at/above the hard cap. NOT
    //    deterministic (a cap raise / accumulator reset could let it proceed), but an
    //    auto-retry would just re-hit the same cap up to `maxRetries` times, so it is
    //    ALSO terminal: surface once to a steward, who raises the cap and re-queues.
    if (
      !(error instanceof RoutingError) ||
      (error.code !== 'privacy-no-match' && error.code !== 'budget-exhausted')
    ) {
      return false;
    }
    // `escalateRoutingToHuman` tags the escalation `routing:${error.code}`; mirror
    // that in the operator log so the two failure modes read distinctly.
    const logTag =
      error.code === 'budget-exhausted' ? 'routing:budget-exhausted' : 'routing:no-tier-match';
    this.logger.warn(logTag, {
      coherenceUnit: issue.id,
      identifier: issue.identifier,
      reason: error.message,
    });
    // Fail-closed: surface to a human exactly once; the issue is NOT dispatched to
    // any backend.
    this.escalateRoutingToHuman(
      issue.id,
      error,
      issue as { identifier?: string; title?: string; description?: string | null }
    );
    // Terminal: drop the unit out of `running`/`claimed` and persist the terminal
    // `canceled` lane. Deterministic → no retry is scheduled (contrast the generic
    // `emitWorkerExit('error')` path, which would enqueue one).
    await this.finalizeRoutingTerminal(issue.id);
    return true;
  }

  /**
   * AMR live-wiring review blocker: terminally retire a unit whose dispatch failed
   * closed (`privacy-no-match`). Mirrors the terminal side of a worker exit —
   * remove the unit from `running` and release its `claimed` slot — then persist
   * the terminal `canceled` lane (`abandon`), matching how retry-exhausted
   * escalations settle. Crucially it does NOT run the state-machine `worker_exit`
   * reducer, so no `scheduleRetry` effect is emitted. Best-effort lane persistence
   * (`persistLaneSafe` never throws). No transport/escalation outcome is recorded —
   * that stays the sole job of the single `routing:no-tier-match` escalation already
   * queued by `escalateRoutingToHuman`.
   */
  private async finalizeRoutingTerminal(issueId: string): Promise<void> {
    this.state.running.delete(issueId);
    this.state.claimed.delete(issueId);
    // abandon → canceled (terminal). Best-effort; never blocks or throws.
    await this.persistLaneSafe(issueId, 'abandon');
    this.emit('state_change', this.getSnapshot());
  }

  /**
   * split-routing Phase 4 (D6/SC5) — terminal SUCCESS settle for a workflow unit.
   * The real `WorkflowEngineContext.emitWorkflowSuccess` forwards here (bound via
   * the context's `settleSuccess` dep in `dispatchIssue`). It reproduces the
   * `worker_exit`/`reason==='normal'` reducer BY HAND (state-machine.ts:457,467-474):
   * `running.delete` → `completed.set(now)` → `claimed.delete` → `cleanWorkspace`
   * effect → then persists the terminal `success` lane and emits one state change.
   *
   * It deliberately does NOT route through `emitWorkerExit`/`handleWorkerExit`
   * (completion/handler.ts): that fires the ISSUE-keyed `finishRecording(issueId,
   * attempt)` + `recordAmrOutcome`, but the engine already ran PER-STAGE recorders
   * (`stageAttemptKey(index, attempt)`) and per-stage `recordOutcome`. Going through
   * the worker-exit path would (a) finish a recording never started at the
   * issue-attempt key and (b) double-feed the escalation state. This is the ONE
   * hand-reproduced reducer sequence in Phase 4; the `worker_exit` reducer itself
   * stays untouched (Task 12 pins it) so the two remain in sync.
   *
   * `runs` are the per-stage records (best-effort telemetry; the per-stage cost is
   * already attributable via the recorders). Never throws — a success settle must
   * complete the single terminal transition (D6).
   *
   * staged-verify-gate-convergence D1/D3/D4 — for a LOCAL last-stage unit this
   * "success" is NOT taken at face value: BEFORE the reducer sequence above, the
   * unit routes through the SAME `runLocalWorkflowGate` the single-dispatch path
   * uses (empty-diff → verify/acceptance → outcome-eval). Gate FAIL → preserve +
   * re-dispatch (handleStagedGateFailure, lane blocked), bounded to
   * `maxLocalStageRetries` → then `settleWorkflowTerminal` (needs-human). Gate PASS
   * → `shipWorkspace` (commit + branch + PR) THEN the reducer sequence above (so
   * `cleanWorkspaceWithGuard` finds the pushed branch + PR and preserves it; the
   * PR-merge auto-dones the row). Non-local/primary units skip all of this and take
   * the reducer sequence unchanged — see ADR 0079/0080.
   */
  private async settleWorkflowSuccess(
    unit: string,
    runs: StageRun[],
    // staged-verify-gate-convergence (blocking fix): the dispatch's live
    // `workspacePath` + `issue`, threaded through the settle-callback closure in
    // `dispatchIssue`. PREFERRED over the running-entry lookup so the acceptance
    // gate fires on EVERY attempt — including a staged RETRY re-dispatch, where the
    // tick does NOT recreate the running entry (the entry-creating claimAndDispatch
    // is bypassed on retry_fired → claim → dispatchIssue). Optional for back-compat
    // with any caller that does not thread them (⇒ fall back to the entry).
    closureWorkspacePath?: string,
    closureIssue?: Issue
  ): Promise<void> {
    const entry = this.state.running.get(unit);
    // staged-verify-gate-convergence D1/D3 — the REAL acceptance gate at staged
    // settle. A staged LOCAL last-stage unit routes through the SAME
    // `runLocalWorkflowGate` the single-dispatch path (#843) uses (empty-diff → the
    // mechanical step → outcome-eval), replacing the empty-diff-ONLY sub-check: after
    // every stage merely RUNS, incomplete work (a rule written but its test/count-bump
    // missing) trivially passes an empty-diff check and ships as hollow success. The
    // #886 empty-diff halt is subsumed as step 0 of the gate.
    //
    // Scoped to the SAME locality predicate the single-dispatch gate uses: only a
    // LOCAL last-stage backend is gated, so non-local/primary staged units are
    // byte-identical (SC5). The workspace + issue come from the dispatch closure
    // (known on every attempt, incl. retries) and fall back to the running entry.
    // Fails OPEN only when the workspace is genuinely UNKNOWN (no closure value AND
    // no entry — the already-deleted-entry race); a gate that RUNS and returns
    // { ok:false } does NOT proceed to success.
    const lastBackendName = runs[runs.length - 1]?.decision?.backendName;
    const lastDef =
      lastBackendName !== undefined ? this.config.agent.backends?.[lastBackendName] : undefined;
    // isLocalExecutionBackend: a `codex` execution stage settles through the same
    // enforced gate + ship path as a local-endpoint stage (its change is in the worktree).
    const isLocal = lastDef !== undefined && isLocalExecutionBackend(lastDef);
    const workspacePath = closureWorkspacePath ?? entry?.workspacePath;
    const issue = closureIssue ?? entry?.issue;
    if (isLocal && workspacePath !== undefined && issue !== undefined) {
      // D2: the acceptance command override, recovered from the matched workflow decl
      // (undefined ⇒ the gate uses verifyRunner unchanged).
      const acceptance = this.acceptanceCommandForIssue(issue);
      const gate = await this.runLocalWorkflowGate(
        issue,
        workspacePath,
        lastBackendName!,
        acceptance
      );
      if (!gate.ok) {
        // D3 — gate FAIL: preserve + converge (extracted for reviewability). The
        // `attempt` seed comes from the entry when present, else the fed-back reason
        // is enough for the retry — the state machine bumps its own attempt.
        await this.handleStagedGateFailure(
          unit,
          runs,
          entry?.identifier,
          entry?.attempt,
          gate.reason,
          issue
        );
        return;
      }
      // D4 — gate PASS: SHIP deterministically. The weak local model usually skips
      // push+PR (LESSONS.md #874), so the orchestrator commits the accumulated work,
      // pushes an `orchestrator/<identifier>` branch, and opens a PR BEFORE the
      // existing success finalize — so `cleanWorkspaceWithGuard` (below) finds the
      // pushed branch + PR and takes its preserve/record path (the PR-merge auto-dones
      // the row → the loop stops). A ship FAILURE is a BLOCK, not a hollow success:
      // route it through the SAME preserve+retry seam as a gate failure (a green build
      // that cannot ship must retry/escalate, never silently drop).
      const shipIdentifier = entry?.identifier ?? issue.identifier ?? unit;
      // S1: thread the ALREADY-KNOWN, gate-verified `workspacePath` (the exact
      // worktree the acceptance gate just passed) into the ship, so it commits that
      // worktree rather than re-deriving the path from the identifier — the two can
      // only ever diverge on identifier-sanitization drift, but pinning the gated
      // path removes that failure mode entirely.
      const ship = await this.workspace.shipWorkspace(shipIdentifier, {
        ...this.buildShipPr(issue),
        workspacePath,
      });
      if (!ship.ok) {
        await this.handleStagedGateFailure(
          unit,
          runs,
          entry?.identifier,
          entry?.attempt,
          `ship failed: ${ship.error.message}`,
          issue
        );
        return;
      }
      // Shipped — the unit converged. Clear the retry counter and fall through to the
      // existing success path (cleanWorkspaceWithGuard now finds the pushed branch+PR).
      this.localStageGateAttempts.delete(unit);
      this.stageCheckpoints.delete(unit); // resume-checkpoint cleared at every terminal
      // IMPORTANT #2 — record the durable double-ship guard. `state.completed`
      // (set by the reducer sequence below) is only TRANSIENT: it is released past
      // the grace window for a still-active row, which would re-select + RE-SHIP
      // this unit. This process-lifetime set permanently excludes it from the tick's
      // candidate set (filterCandidatesWithOpenPRs) — matching, not weaker than, the
      // single-dispatch durable guard (markIssueComplete flips the row terminal).
      this.#shippedThisRun.add(unit);
      this.recordFlightVerdict({
        issueId: unit,
        identifier: shipIdentifier,
        verdict: 'shipped',
        ...(entry?.attempt !== undefined ? { attempt: entry.attempt } : {}),
      });
    }
    // Reducer normal-exit sequence (state-machine.ts:457,467-469):
    this.state.running.delete(unit);
    this.state.completed.set(unit, Date.now());
    this.state.claimed.delete(unit);
    this.logger.info(`Workflow unit ${unit} completed all stages`, {
      issueId: unit,
      stages: runs.length,
    });
    // The reducer's cleanWorkspace effect (state-machine.ts:470-474), run inline.
    await this.cleanWorkspaceWithGuard(entry?.identifier ?? unit, unit);
    // success → done (terminal). Best-effort; never blocks or throws.
    await this.persistLaneSafe(unit, 'success');
    // S1 drain (ADR 0060) — emitWorkerExit parity (orchestrator.ts drain on normal
    // exit). A model pinned by the final stage's backendFactory.forUseCase may now be
    // free; drain it here rather than waiting for the next refresh-tick. Fire-and-forget.
    void this.drainDeferredEvictions();
    this.emit('state_change', this.getSnapshot());
  }

  /**
   * staged-verify-gate-convergence D2 — recover the acceptance command for a unit
   * from the workflow decl that matched it. Delegates to `workflowFor` — the SINGLE
   * match authority `dispatchIssue` used (identical prefix+labels+`>= 2`-stage
   * semantics, including the `< 2`-stage fallback) — and reads the matched decl's
   * `acceptance` off the returned `WorkflowMatch`. Returns `undefined` when no
   * `>= 2`-stage decl matches or the matched decl declares no `acceptance` (⇒ the
   * settle gate uses `verifyRunner` unchanged). Pure; no side effects.
   */
  private acceptanceCommandForIssue(issue: Issue): string | undefined {
    return workflowFor(issue, this.config)?.acceptance;
  }

  /**
   * staged-verify-gate-convergence D4 — derive the PR title + body for a
   * deterministic ship of a converged local staged unit. Title is the issue
   * title (falling back to its identifier); body is a short summary noting the
   * autonomous local dispatch and that the acceptance gate passed. A `Closes #N`
   * trailer is appended ONLY when the issue's `externalId` carries a numeric
   * GitHub issue number (e.g. `github:owner/repo#42`) — never fabricated: without
   * a real number the trailer is omitted so the PR does not close an unrelated
   * issue. Pure; no side effects.
   */
  private buildShipPr(issue: Issue): { title: string; body: string } {
    const title = issue.title?.trim() || issue.identifier;
    // Parse a trailing `#<digits>` off the external tracker id, if present.
    const match = issue.externalId?.match(/#(\d+)\s*$/);
    const closes = match ? `\n\nCloses #${match[1]}` : '';
    const body =
      `Autonomous local dispatch: ${issue.identifier}.\n\n` +
      `This change was produced by the orchestrator's local staged workflow and ` +
      `passed the acceptance gate (typecheck + lint + test / the declared acceptance ` +
      `command).${closes}`;
    return { title, body };
  }

  /**
   * staged-verify-gate-convergence D3 — the gate-FAIL branch of the staged settle,
   * extracted so `settleWorkflowSuccess` stays reviewable. PRESERVE the workspace
   * (do NOT cleanWorkspaceWithGuard, do NOT persistLane('success')): stash the
   * failure reason so the next dispatch's prompt gets the failure preamble (the SAME
   * map the single-dispatch path uses), then drive the retry through the SAME
   * `emitWorkerExit('error')` seam. #890's ensureWorkspace reuse accumulates work
   * across the preserved-workspace attempts. Bounded to `maxLocalStageRetries`
   * consecutive failures → the existing needs-human terminal (which cleans +
   * escalates). Behavior is identical to the pre-extraction inline branch.
   */
  /**
   * Record a unit's disposition to the flight recorder ("black-box"). Best-effort:
   * a recorder failure must never break a dispatch, so it swallows everything.
   */
  private recordFlightVerdict(v: {
    issueId: string;
    identifier?: string;
    verdict: Verdict;
    attempt?: number | null;
    gateReason?: string;
    pr?: number;
  }): void {
    if (this.flightRecorder === null) return;
    try {
      this.flightRecorder.recordVerdict({ ...v, identifier: v.identifier ?? v.issueId });
    } catch {
      /* best-effort */
    }
  }

  private async handleStagedGateFailure(
    unit: string,
    runs: StageRun[],
    identifier: string | undefined,
    attempt: number | null | undefined,
    gateReason: string,
    // Optional: the failing unit's issue — enables the reasoner unstick advisory on
    // a stalled retry. Omitted by callers without it in scope (advisory simply skipped).
    issue?: Issue
  ): Promise<void> {
    const attempts = (this.localStageGateAttempts.get(unit) ?? 0) + 1;
    const bound =
      this.config.agent.routing?.maxLocalStageRetries ?? DEFAULT_MAX_LOCAL_STAGE_GATE_RETRIES;
    if (attempts >= bound) {
      // D3 tail — bounded retries exhausted → the existing needs-human terminal
      // (which cleans + escalates). Reset the counter so a future re-pickup is fresh.
      this.localStageGateAttempts.delete(unit);
      this.stageCheckpoints.delete(unit); // resume-checkpoint cleared at every terminal
      this.priorGateFailureByIssue.delete(unit);
      // Durable process-lifetime guard: the terminal marks the LANE (canceled), not
      // the ROW — the row stays `in-progress`, so the tick would re-select this unit
      // and reset the retry counter (an infinite loop). Record it here (only on the
      // bound-exhausted branch — a unit still RETRYING below the bound must NOT be in
      // this set) so filterCandidatesWithOpenPRs + dispatchIssue permanently skip it.
      this.#escalatedThisRun.add(unit);
      this.recordFlightVerdict({
        issueId: unit,
        ...(identifier ? { identifier } : {}),
        verdict: 'needs-human',
        attempt: attempts,
        gateReason,
      });
      await this.settleWorkflowTerminal(
        unit,
        runs,
        undefined,
        new Error(`verification failed after ${attempts} attempts: ${gateReason}`)
      );
      return;
    }
    this.localStageGateAttempts.set(unit, attempts);
    // Reasoner unstick advisory (your-idea): on a STALLED retry, ask the thinking model
    // to diagnose + prescribe a fix, and prepend it to the coder's next-attempt feedback.
    // Best-effort — undefined leaves the raw distilled failure exactly as before.
    const advisory =
      issue !== undefined
        ? await this.maybeReasonerUnstickAdvisory(issue, gateReason, attempts, bound)
        : undefined;
    const feedback = advisory !== undefined ? `${advisory}\n\n${gateReason}` : gateReason;
    this.priorGateFailureByIssue.set(unit, feedback);
    this.recordFlightVerdict({
      issueId: unit,
      ...(identifier ? { identifier } : {}),
      verdict: 'gate-blocked',
      attempt: attempts,
      gateReason,
    });
    this.logger.info(`staged local gate blocked ${identifier ?? unit}; re-dispatching (SC1)`, {
      issueId: unit,
      attempt: attempts,
    });
    // Route the failure through the SHIPPED single-dispatch retry seam. For a staged
    // unit the running entry's `session` is null (per-stage sessions live in
    // stageRuns), so emitWorkerExit's finishRecording is a no-op and the per-stage
    // recorders are not double-fed; the error branch emits the scheduleRetry/escalate
    // effect. `attempt` is undefined on a retry (no running entry) — emitWorkerExit
    // accepts `number | null` and the state machine drives its own attempt bump.
    await this.emitWorkerExit(unit, 'error', attempt ?? null, gateReason);
  }

  /**
   * split-routing Phase 4 (D6/I1/SC5) — terminal FAILURE/safety-net settle for a
   * workflow unit. The real context's `finalizeWorkflowTerminal` forwards here
   * (bound via `settleTerminal`). Composed from the `finalizeRoutingTerminal`
   * pattern (`running.delete` + `claimed.delete` + `persistLaneSafe('abandon')`,
   * orchestrator.ts:2388-2394) PLUS a single `needs-human` escalation
   * (escalateRoutingToHuman-style queue push, :2301-2316) PLUS `cleanWorkspace`
   * (S5). It must NEVER rethrow — the engine's `catch` calls it on the I1 safety
   * net, so a throw here would defeat the single-exit guarantee.
   *
   * It is NOT a verbatim `finalizeRoutingTerminal` call (that lacks the needs-human
   * + cleanWorkspace the Phase-3 terminal contract pinned). Exactly one needs-human
   * per terminal transition.
   */
  private async settleWorkflowTerminal(
    unit: string,
    runs: StageRun[],
    failingStep?: WorkflowExecutionPlan['stages'][number],
    err?: unknown
  ): Promise<void> {
    try {
      // staged-verify-gate-convergence D3: this unit is settling terminally — clear
      // its staged-gate retry counter + prior-failure preamble so a future re-pickup
      // starts fresh (no stale carry-over from a prior convergence attempt).
      this.localStageGateAttempts.delete(unit);
      this.stageCheckpoints.delete(unit); // resume-checkpoint cleared at every terminal
      this.priorGateFailureByIssue.delete(unit);
      const entry = this.state.running.get(unit);
      const identifier = entry?.identifier ?? unit;
      this.state.running.delete(unit);
      this.state.claimed.delete(unit);
      await this.persistLaneSafe(unit, 'abandon');
      // Exactly one needs-human escalation (mirrors escalateRoutingToHuman's push,
      // :2301-2316) — carries the failing stage + error context for the steward.
      const errMessage =
        err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
      const reasons = [
        'workflow:terminal',
        failingStep ? `stage:${failingStep.skill} did not pass` : 'workflow stage error',
        ...(err !== undefined ? [errMessage] : []),
      ];
      await this.interactionQueue
        .push({
          id: `interaction-${randomUUID()}`,
          issueId: unit,
          type: 'needs-human',
          reasons,
          context: {
            issueTitle: entry?.issue.title ?? identifier,
            issueDescription: entry?.issue.description ?? null,
            specPath: null,
            planPath: null,
            relatedFiles: [],
          },
          createdAt: new Date().toISOString(),
          status: 'pending',
        })
        .catch((qerr) => {
          this.logger.warn(`Failed to queue workflow terminal escalation for ${unit}`, {
            unit,
            error: String(qerr),
          });
        });
      await this.cleanWorkspaceWithGuard(identifier, unit);
      // S1 drain (ADR 0060) — emitWorkerExit parity (drain on error exit). Free any
      // model pinned by the failing stage's backendFactory.forUseCase. Fire-and-forget.
      void this.drainDeferredEvictions();
      this.logger.warn(`Workflow unit ${unit} terminated (${runs.length} stage run(s))`, {
        issueId: unit,
        failingSkill: failingStep?.skill,
      });
      this.emit('state_change', this.getSnapshot());
    } catch (settleErr) {
      // I1: never rethrow — a settle failure must not break the single-exit guarantee.
      this.logger.error(`settleWorkflowTerminal failed for ${unit}`, {
        unit,
        error: String(settleErr),
      });
    }
  }

  /**
   * Hermes Phase 3: wire in-process notification sinks against the
   * orchestrator's event bus (`this`). A misconfigured sink (unknown kind,
   * missing env var) logs + skips rather than breaking startup — the
   * hardened doctor (`harness doctor`) surfaces the gap. Sinks subscribe
   * to the same topics as `wireWebhookFanout`; a slow Slack call cannot
   * block webhook delivery because the two paths fan out independently.
   */
  private setupNotifications(
    notifConfig: import('@harness-engineering/types').NotificationsConfig | undefined
  ): void {
    if (!notifConfig || !notifConfig.sinks || notifConfig.sinks.length === 0) return;
    try {
      this.notificationsRegistry = SinkRegistry.fromConfig(notifConfig, {
        env: process.env,
      });
      this.notificationFanoutOff = wireNotificationSinks({
        bus: this,
        registry: this.notificationsRegistry,
      });
    } catch (err) {
      this.logger.warn(
        `notifications sink registry failed: ${err instanceof Error ? err.message : String(err)}; sinks disabled`
      );
      delete this.notificationsRegistry;
    }
  }

  /**
   * Stops execution for a specific issue.
   *
   * @param issueId - The ID of the issue to stop
   */
  private async stopIssue(issueId: string): Promise<void> {
    this.logger.info(`Stopping issue: ${issueId}`);

    const tracked = this.abortControllers.get(issueId);

    // 1. Abort the background task generator loop
    if (tracked) {
      tracked.controller.abort();
      this.logger.info(`Abort signal sent for ${issueId}`);
    }

    // 2. Kill the agent subprocess if we have a PID.
    //    Read from tracked map (not running entry) because the state machine
    //    may have already removed the running entry (e.g., stall_detected).
    const pid = tracked?.pid ?? this.state.running.get(issueId)?.session?.agentPid;
    if (pid) {
      try {
        process.kill(pid, 'SIGTERM');
        this.logger.info(`Sent SIGTERM to agent PID ${pid} for ${issueId}`);
      } catch {
        // Process may have already exited — safe to ignore
      }
    }
  }

  /**
   * Dispatch a work item immediately, bypassing the normal tick → roadmap cycle.
   * Used by the dashboard's "Dispatch Now" action.
   */
  public async dispatchAdHoc(issue: Issue): Promise<void> {
    // Clone state to avoid racing with a concurrent tick
    const next = {
      ...this.state,
      claimed: new Set(this.state.claimed),
      running: new Map(this.state.running),
      retryAttempts: new Map(this.state.retryAttempts),
      completed: new Map(this.state.completed),
      recentRequestTimestamps: [...this.state.recentRequestTimestamps],
      recentInputTokens: [...this.state.recentInputTokens],
      recentOutputTokens: [...this.state.recentOutputTokens],
      tokenTotals: { ...this.state.tokenTotals },
      rateLimits: { ...this.state.rateLimits },
    };
    next.claimed.add(issue.id);
    next.running.set(issue.id, {
      issueId: issue.id,
      identifier: issue.identifier,
      issue,
      attempt: 1,
      workspacePath: '',
      startedAt: new Date().toISOString(),
      phase: 'PreparingWorkspace',
      session: null,
    });
    this.state = next;

    this.emit('state_change', this.getSnapshot());
    await this.dispatchIssue(issue, 1, 'local');
  }

  /**
   * Initialize the LocalModelResolver and intelligence pipeline.
   *
   * Runs the initial probe (so resolver state reflects server availability)
   * before constructing the intelligence pipeline. Subscribes the dashboard
   * broadcast stub to status changes. Called exactly once from start().
   */
  /**
   * LMLM Phase 6: construct the live `PoolManager` (Ollama installer + the
   * loaded pool-state store) and stash it for `getModelPool()`. Defensive
   * config fallbacks: `ollamaEndpoint → http://localhost:11434`. The pool reads
   * `store.snapshot()` lazily, so this runs safely at construction time before
   * `store.load()`.
   */
  private initModelPool(store: PoolStateStore): void {
    const onWarn = (message: string, cause?: unknown): void =>
      this.logger.warn(message, cause !== undefined ? { cause } : undefined);
    const installerCfg = this.config.localModels?.installer;
    this.modelInstaller = new OllamaInstallAdapter({
      baseUrl: installerCfg?.ollamaEndpoint ?? 'http://localhost:11434',
      onWarn,
      // Survive transient `/api/pull` drops (most often the host sleeping mid
      // multi-GB download): ollama resumes from cached blobs, and any forward
      // progress resets the budget, so an install nibbled through across several
      // sleep cycles still completes instead of dead-ending in an error.
      maxPullRetries: 5,
    });
    this.modelPool = new PoolManager({ store, installer: this.modelInstaller, onWarn });
  }

  /**
   * Resume installs interrupted by a restart. A proposal left `installing` had
   * its background `ollama pull` cut short when the orchestrator went down; the
   * pull is idempotent (ollama resumes from cached blobs), so we re-drive it.
   * Fire-and-forget with its own error isolation — a resumed multi-GB download
   * must not block startup, and a re-drive failure only logs.
   */
  private redriveInterruptedInstalls(): void {
    const pool = this.modelPool;
    if (pool === null) return;
    void (async () => {
      try {
        // `listProposals` only filters on the shared skill-status enum, so filter
        // the model-only `installing` status here.
        const modelProposals = (await listProposals(this.projectRoot, {
          kind: 'model',
        })) as ModelProposalRecord[];
        const installing = modelProposals.filter((p) => p.status === 'installing');
        if (installing.length === 0) return;
        this.logger.info(`Resuming ${installing.length} model install(s) interrupted by a restart`);
        await redriveInstallingProposals(
          {
            pool,
            bus: this,
            updateProposal: (id, patch) =>
              updateProposal(this.projectRoot, id, patch as Parameters<typeof updateProposal>[2]),
            decidedBy: 'orchestrator',
            isModelInUse: (name) => this.isLocalModelInUse(name),
          },
          installing,
          {
            onWarn: (message, cause) =>
              this.logger.warn(message, cause !== undefined ? { cause } : undefined),
          }
        );
      } catch (err) {
        this.logger.warn('interrupted-install re-drive failed', { cause: err });
      }
    })();
  }

  /**
   * LMLM Phase 7 wiring: apply the operator's configured pool bounds (disk
   * budget + org/family allowlist) from `localModels.pool` to the live pool.
   * Called after `PoolStateStore.load()` so config wins over persisted bounds
   * (D2, declarative precedence). No-op when the pool is null (LMLM disabled)
   * or no `pool` block is configured, so it is safe to call unconditionally
   * on the startup path.
   */
  private async applyConfiguredPoolBounds(): Promise<void> {
    const pool = this.modelPool;
    const bounds = this.config.localModels?.pool;
    if (pool === null || !bounds) return;
    await pool.configurePool({
      diskBudgetGb: bounds.diskBudgetGb,
      allowedOrgs: bounds.allowedOrgs,
      allowedFamilies: bounds.allowedFamilies,
    });
  }

  /**
   * LMLM Phase 6: arm the single background refresh scheduler over the live
   * pool. No-op when LMLM is disabled (`modelPool` null). Each tick runs
   * hardware→recommend→reconcile(D12 drift)→diff→emit→score-writeback.
   *
   * NOTE (deferred): the recommender is seeded with an empty candidate set —
   * Phase 2's live-HF→RankerCandidate parser was never built, so autonomous
   * swap-proposal discovery is out of scope here (flagged concern). The tick
   * still performs F10 drift reconciliation, O1 logging, and re-ranks/dedups
   * whatever candidates are supplied — the wiring is complete and candidate
   * breadth is the only piece deferred to the Phase 2 recommender.
   */
  private startRefreshScheduler(): void {
    if (this.modelPool === null) return;
    const pool = this.modelPool;
    const refreshCfg = this.config.localModels?.refresh;
    // LMLM Phase 2 completion: source ranking candidates from the bundled,
    // human-curated frozen snapshot (offline-safe, deterministic — the same
    // pattern as the benchmark snapshot), filtered to the operator's approved
    // org/family allowlist so we never recommend a model the pool can't
    // install. Live HF discovery runs in the on-demand
    // `scripts/refresh-model-candidates.mjs` generator (D3/D5), keeping the
    // interactive recommendations route free of per-request network calls.
    const frozen = loadFrozenCandidates();
    const candidates = selectCandidates(frozen.candidates, this.config.localModels?.pool);
    for (const warning of frozen.warnings) {
      this.logger.warn('LMLM frozen candidate snapshot degraded', { warning });
    }
    if (candidates.length === 0) {
      this.logger.warn('LMLM recommender has no candidates', {
        frozenCount: frozen.candidates.length,
        allowedOrgs: this.config.localModels?.pool?.allowedOrgs ?? [],
      });
    }
    // Phase 7: reuse this recommender for the on-demand recommendations route so
    // the HTTP surface and the background tick share one ranking path. Seed it
    // from the frozen snapshot now; a live HF refresh (startup + operator button)
    // swaps in a fresh recommender via `seedRecommender`, and this indirection
    // makes the change take effect on the next tick and the next route call.
    this.seedRecommender(candidates, 'frozen');
    const recommend = (hardware: HardwareProfile) => this.modelRecommender!(hardware);
    // Bind the agentic tool-calling probe to the local backend's endpoint so the score
    // writeback can stamp each pooled model's capability once — keeping a build from routing
    // to a text-only model (see `PoolEntry.toolCalling`). Absent local endpoint ⇒ no probe
    // (capability stays unknown ⇒ fail-open in candidate selection).
    let localEndpoint: string | undefined;
    let localApiKey: string | undefined;
    for (const def of Object.values(this.config.agent.backends ?? {})) {
      if (isLocalEndpointBackend(def) && typeof def.endpoint === 'string') {
        localEndpoint = def.endpoint;
        localApiKey = def.apiKey;
        break;
      }
    }
    // Harness-fit probe deps (D5): built ONCE and passed to every tick. `undefined`
    // when the probe is disabled/absent so the tick path is byte-identical to before.
    const harnessFitDeps = this.buildHarnessFitDeps(localEndpoint, localApiKey);
    this.refreshScheduler = new RefreshScheduler({
      runTick: () =>
        runRefreshTick({
          detectHardware: () => this.detectLmlmHardware(),
          recommend,
          poolManager: pool,
          dedupSource: () => this.lmlmDedupSource(),
          // Phase 7: after persisting the proposal, emit `local-models:proposal`
          // (== MODEL_PROPOSAL_TOPIC) on the bus so it fans out to WS clients and
          // notification sinks. Literal to avoid a proposals/model-handlers cycle.
          emitProposal: (c) =>
            createModelProposal(this.projectRoot, c).then((record) => {
              this.emit('local-models:proposal', {
                id: record.id,
                status: 'created',
                action: c.action,
                target: c.target.ollamaName,
              });
            }),
          proposalThreshold: refreshCfg?.proposalThreshold ?? 5,
          ...(localEndpoint !== undefined
            ? {
                probeToolCalling: (ollamaName: string) =>
                  probeToolCalling({
                    model: ollamaName,
                    baseUrl: localEndpoint,
                    ...(localApiKey !== undefined ? { apiKey: localApiKey } : {}),
                  }),
              }
            : {}),
          // Harness-fit probe (D5): only wired when `localModels.harnessFit.enabled`.
          // Absent ⇒ `runRefreshTick` takes the byte-identical no-probe path.
          ...(harnessFitDeps !== undefined ? { harnessFit: harnessFitDeps } : {}),
        }).then((result) => {
          // S1 drain liveness (P7-SUG-DRAIN-LIVENESS): run completion is the
          // primary drain trigger, but if the final run's evict fails
          // transiently and no further run ever completes, a model would linger
          // pendingEviction (over disk budget) forever. Piggyback a best-effort
          // drain on the periodic tick so pending evictions retry independently
          // of agent-run completions. Fire-and-forget + reentrancy-guarded
          // (P7-SUG-DRAIN-REENTRANCY) so it never blocks the tick's O1 result.
          void this.drainDeferredEvictions();
          return result;
        }),
      intervalMs: refreshCfg?.intervalMs ?? 86_400_000,
      jitterMs: refreshCfg?.jitterMs ?? 600_000,
      logger: this.logger,
      ...(this.schedulerTimerOverride ?? {}),
    });
    this.refreshScheduler.start();
  }

  /**
   * Build the harness-fit probe deps bundle (harness-fit-probe D5, Task 3) — the
   * composition-root wiring that makes the probe actually FIRE when enabled. Returns
   * `undefined` (⇒ no probe; byte-identical prior tick behaviour) UNLESS
   * `config.localModels.harnessFit.enabled` is true.
   *
   * When enabled it constructs the three injected seams the pure policy needs:
   *   - `runner`  — a {@link HarnessFitProbeRunner} (orchestrator-owned; local-models
   *     keeps only the interface), pointed at the discovered local endpoint.
   *   - `cache` + `getLastProbeAt`/`setLastProbeAt` — a persistent
   *     {@link HarnessFitCacheFileStore} under `~/.harness/local-models/` (buildQuality
   *     cache AND cadence timestamp), mirroring the pool state store.
   *   - `reRankWithBuildQuality` — a {@link createBuildQualityReRanker} binding that
   *     re-runs the SAME ranker over the held candidate set with probed buildQuality
   *     threaded in (no ranker-math duplication).
   *
   * It also does the config→deps field translation the reviewer flagged:
   * `cadenceMs → intervalMs`, `taskIds → tasks`, plus `cacheTtlMs`/`topN` pass-through.
   */
  private buildHarnessFitDeps(
    localEndpoint: string | undefined,
    localApiKey: string | undefined
  ): HarnessFitProbeDeps | undefined {
    const cfg = this.config.localModels?.harnessFit;
    if (cfg === undefined || cfg.enabled !== true) return undefined;

    const runner = new HarnessFitProbeRunner({
      ...(localEndpoint !== undefined ? { endpoint: localEndpoint } : {}),
    });
    void localApiKey; // reserved: the ollama probe endpoint is unauthenticated today

    const cache = new HarnessFitCacheFileStore({
      onWarn: (message, cause) =>
        this.logger.warn(message, cause !== undefined ? { cause } : undefined),
    });

    // Re-rank binding: re-run the recommender over the HELD candidate set (augmented
    // with buildQuality inside the re-ranker), reusing the whole existing rank algorithm.
    const reRankWithBuildQuality = createBuildQualityReRanker(
      this.recommenderCandidates,
      (augmented) => createNativeRecommender({ candidates: augmented })
    );

    // config→deps field translation (reviewer-flagged): cadenceMs→intervalMs,
    // taskIds→tasks (resolved against the shipped default suite), topN/cacheTtlMs pass-through.
    const tasks = resolveHarnessFitTasks(cfg.taskIds);

    return {
      enabled: true,
      topN: cfg.topN,
      intervalMs: cfg.cadenceMs,
      cacheTtlMs: cfg.cacheTtlMs,
      runner,
      cache,
      getLastProbeAt: () => cache.getLastProbeAt(),
      setLastProbeAt: (at) => cache.setLastProbeAt(at),
      reRankWithBuildQuality,
      ...(tasks !== undefined ? { tasks } : {}),
    };
  }

  /** (Re)build the recommender over `candidates` and record the seeding source. */
  private seedRecommender(candidates: readonly FrozenCandidate[], source: 'frozen' | 'live'): void {
    this.modelRecommender = createNativeRecommender({ candidates });
    // Hold the candidate set so the harness-fit re-rank can re-run the SAME ranking
    // path over it with probed buildQuality threaded in (harness-fit-probe D5).
    this.recommenderCandidates = candidates;
    this.candidateSourceState = { source, count: candidates.length };
  }

  /**
   * Refresh ranking candidates live from HuggingFace, merge the curated
   * `ollamaName`/`family` tags from the frozen snapshot (so results stay
   * installable — decision A), and re-seed the recommender. Fail-closed: on any
   * error or an empty installable result, the current candidates stand. Runs a
   * `forceRefresh` tick so recommendations + proposals reflect the fresh set.
   * Used by both the startup background refresh and the operator "Refresh" button.
   */
  private async refreshCandidatesLive(
    signal?: AbortSignal
  ): Promise<{ source: 'frozen' | 'live'; count: number }> {
    const poolCfg = this.config.localModels?.pool;
    const orgs = poolCfg?.allowedOrgs ?? [];
    if (orgs.length === 0) return this.candidateSourceState;

    const curation = curationFromCandidates(loadFrozenCandidates().candidates);
    let result: DiscoverCandidatesResult;
    try {
      result = await this.discoverCandidatesFn({
        orgs,
        curation,
        ...(signal ? { signal } : {}),
        onWarn: (m, cause) => this.logger.warn(m, cause !== undefined ? { cause } : undefined),
      });
    } catch (err) {
      this.logger.warn('LMLM live candidate discovery failed; keeping current candidates', {
        cause: err,
      });
      return this.candidateSourceState;
    }

    const selected = selectCandidates(result.candidates, poolCfg);
    if (selected.length === 0) {
      this.logger.warn('LMLM live discovery yielded no installable candidates; keeping current', {
        warnings: result.warnings,
      });
      return this.candidateSourceState;
    }

    this.seedRecommender(selected, 'live');
    this.logger.info('LMLM candidates refreshed from HuggingFace', { count: selected.length });
    await this.refreshScheduler?.forceRefresh();
    // Nudge the dashboard to refetch recommendations against the fresh set.
    this.emit('local-models:pool', {
      phase: 'candidates_refreshed',
      source: 'live',
      count: selected.length,
    });
    return this.candidateSourceState;
  }

  /** Resolve the hardware profile for a refresh tick (operator override wins). */
  private async detectLmlmHardware(): Promise<HardwareProfile> {
    const override = this.config.localModels?.hardware?.override;
    const detector = new HardwareDetector(override !== undefined ? { override } : {});
    return (await detector.detect()).profile;
  }

  /** Map the on-disk model-proposal queue to F7 dedup pairs (open→pending, rejected→rejected). */
  private async lmlmDedupSource(): Promise<DedupPairs> {
    const proposals = await listProposals(this.projectRoot, { kind: 'model' });
    const pending: DedupPair[] = [];
    const rejected: DedupPair[] = [];
    for (const p of proposals) {
      if (p.kind !== 'model') continue;
      const pair: DedupPair = {
        target: p.model.target.ollamaName,
        ...(p.model.replaces ? { replaces: p.model.replaces.ollamaName } : {}),
      };
      if (p.status === 'open') pending.push(pair);
      else if (p.status === 'rejected') rejected.push(pair);
    }
    return { pending, rejected };
  }

  private async initLocalModelAndPipeline(): Promise<void> {
    if (this.localResolvers.size > 0) {
      // Spec 2 Phase 5 (SC39): subscribe each resolver independently. Each
      // listener tags its broadcast with the resolver's backendName +
      // endpoint, producing a NamedLocalModelStatus payload. Multi-banner
      // dashboards (SC40) reconstruct a per-name map from these per-resolver
      // events; the legacy single-banner consumer reads
      // `getLocalModelStatus` (first-resolver) via the deprecated singular
      // endpoint.
      //
      // Subscribe BEFORE the initial probe so the first status diff
      // (default empty state -> probe-1 result) is broadcast to the
      // dashboard. SC21 relies on observing both initial-probe-failure
      // and subsequent recovery as distinct broadcasts.
      const backends = this.config.agent.backends ?? {};
      for (const [name, resolver] of this.localResolvers) {
        const def = backends[name];
        // Defensive: a resolver in the Map without a corresponding backend
        // def is a contract violation — skip but log. (The Map is built
        // FROM backends, so this should not fire.)
        if (!def || (def.type !== 'local' && def.type !== 'pi')) {
          this.logger.warn('Resolver without matching backend def — broadcast skipped', {
            name,
          });
          continue;
        }
        const endpoint = def.endpoint;
        const unsubscribe = resolver.onStatusChange((status) => {
          const named: import('@harness-engineering/types').NamedLocalModelStatus = {
            ...status,
            backendName: name,
            endpoint,
          };
          this.server?.broadcastLocalModelStatus(named);
        });
        this.localModelStatusUnsubscribes.push(unsubscribe);
      }
      // Probe each resolver independently — SC37 (multi-resolver
      // independence): unreachable resolvers report `available: false`
      // while reachable ones report `available: true` without
      // cross-contamination.
      // Phase 4 (D5): load the on-disk pool state before the first probe so
      // pool-derived candidates are present when each resolver starts. An
      // absent/malformed file degrades to EmptyPoolState (no throw) → empty
      // candidates until the pool is populated. Skipped when the provider is a
      // test override or LMLM is disabled (poolStateStore is null).
      if (this.poolStateStore !== null) {
        await this.poolStateStore.load();
        // LMLM Phase 7 wiring: seed the operator's configured pool bounds over
        // the just-loaded persisted state. Runs AFTER load() so declarative
        // config wins over stale on-disk bounds — the default persisted state
        // is `diskBudgetGb: 0, allowedOrgs: []`, which would otherwise block
        // every install and leave the dashboard pool card at "0 / 0 GB".
        await this.applyConfiguredPoolBounds();
        // Resume any install whose background pull was cut short by a restart
        // (proposal left `installing`). Fire-and-forget — a large resumed pull
        // must not block startup.
        this.redriveInterruptedInstalls();
      }
      for (const resolver of this.localResolvers.values()) {
        await resolver.start();
      }
      // Consumption Phase 1 (T2): event-driven freshness. A `local-models:pool`
      // mutation (install / swap / eviction) debounce-refreshes every resolver
      // so the new pool member is resolvable in seconds, not up to a poll cycle.
      // Registered once, after resolvers are running, and removed in stop().
      if (this.poolRefreshListener === null && this.localResolvers.size > 0) {
        const listener = (): void => {
          for (const resolver of this.localResolvers.values()) {
            resolver.refresh();
          }
        };
        this.poolRefreshListener = listener;
        this.on('local-models:pool', listener);
      }
    }
    // LMLM Phase 6: start the background refresh scheduler once the pool state
    // is loaded. Guarded on modelPool so LMLM-disabled configs never arm it.
    this.startRefreshScheduler();
    // Live candidate discovery on startup: the frozen snapshot already seeded the
    // recommender (instant, offline-safe), so pull fresh HuggingFace candidates in
    // the background and swap them in when ready. Fire-and-forget + fail-closed —
    // a network failure just leaves the frozen list in place.
    if (this.modelPool !== null) {
      void this.refreshCandidatesLive().catch((err) =>
        this.logger.warn('LMLM startup candidate refresh failed', { cause: err })
      );
    }
    // Defer pipeline construction until after the resolver has observed the
    // server. createIntelligencePipeline() consults resolver.getStatus() via
    // createAnalysisProvider() and returns null when local is unavailable.
    this.pipeline = this.createIntelligencePipeline();
    // The server was built with pipeline=null at construction time; refresh
    // the reference so /api/analyze sees the real pipeline.
    this.server?.setPipeline(this.pipeline);
  }

  /**
   * Starts the polling loop and the internal HTTP server.
   * Runs startup reconciliation to release orphaned claims before the first tick.
   */
  public async start(): Promise<void> {
    // Point the eval MCP tools (acceptance_eval / outcome_eval) at the local
    // reasoner so their LLM judgment runs fully-locally instead of degrading to
    // an advisory stub without an ANTHROPIC_API_KEY. Applied before any dispatch
    // so codex (spawned with env: process.env) passes it to the harness MCP
    // server it injects. An explicit operator value always wins; a non-local
    // config (no thinking-mode endpoint) is a no-op.
    const analysisEnv = applyAnalysisEnv(this.config);
    if (analysisEnv !== null) {
      this.logger.info(
        `Eval analysis provider → ${analysisEnv.HARNESS_ANALYSIS_BASE_URL} ` +
          `(model: ${analysisEnv.HARNESS_ANALYSIS_MODEL ?? '(endpoint default)'})`
      );
    }

    if (this.server) {
      void this.server.start();
    }

    // Phase 5: kick off the OTLP timer flush. start() is idempotent and a
    // no-op when `enabled === false`.
    if (this.otlpExporter) {
      this.otlpExporter.start();
    }

    await this.initLocalModelAndPipeline();

    // Resolve orchestrator identity and initialize ClaimManager before first tick
    await this.ensureClaimManager();

    // Flight recorder: pin provenance (git HEAD, node, backends, routing) for this
    // run so any later verdict is falsifiable against WHICH code/config produced it.
    // Best-effort — a recorder failure must never prevent the orchestrator starting.
    try {
      const flightId = await this.orchestratorIdPromise;
      this.flightRecorder?.startRun(flightId, gatherProvenance(this.config));
    } catch (err) {
      this.logger.warn('Flight recorder failed to start', { error: String(err) });
    }

    // Startup reconciliation: release orphaned claims from previous crash
    const runningIssueIds = new Set(this.state.running.keys());
    const reconcileResult = await this.claimManager!.reconcileOnStartup(runningIssueIds);
    if (!reconcileResult.ok) {
      this.logger.warn('Startup reconciliation failed, proceeding with first tick', {
        error: String(reconcileResult.error),
      });
    } else if (reconcileResult.value.length > 0) {
      this.logger.info(
        `Startup reconciliation released ${reconcileResult.value.length} orphaned claim(s)`,
        { releasedIds: reconcileResult.value }
      );
    }

    const intervalMs = this.config.polling.intervalMs || 30000;
    const jitterMs = this.config.polling.jitterMs ?? 0;

    const scheduleNextTick = () => {
      const jitter = jitterMs > 0 ? Math.round((Math.random() * 2 - 1) * jitterMs) : 0;
      const delay = Math.max(0, intervalMs + jitter);
      this.interval = setTimeout(() => {
        void this.tick().finally(() => scheduleNextTick());
      }, delay);
    };

    scheduleNextTick();
    void this.tick(); // Initial tick (no jitter)

    // Heartbeat: refresh claims for all running issues on a separate interval.
    // Default interval is half the polling interval so claims stay fresh between ticks.
    const heartbeatMs = Math.max(5000, Math.floor(intervalMs / 2));
    this.heartbeatInterval = setInterval(() => {
      if (this.claimManager) {
        const runningIds = Array.from(this.state.running.keys());
        if (runningIds.length > 0) {
          void this.claimManager.heartbeat(runningIds).catch((err) => {
            this.logger.warn('Heartbeat failed', { error: String(err) });
          });
        }
      }
    }, heartbeatMs);

    // Start maintenance scheduler if enabled
    if (this.config.maintenance?.enabled) {
      await this.initMaintenance(this.config.maintenance);
    }
  }

  /**
   * Stops the orchestrator, clearing the polling interval and stopping the server.
   */
  public async stop(): Promise<void> {
    // Seal the black-box first so an abrupt teardown still leaves a stamped record.
    this.flightRecorder?.finishRun();
    if (this.interval) {
      clearTimeout(this.interval);
      this.interval = undefined;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    for (const unsub of this.localModelStatusUnsubscribes) {
      unsub();
    }
    this.localModelStatusUnsubscribes = [];
    // Spec B Phase 5 (Phase 4 review-S2 fix): release any subscribers
    // (the WS broadcaster registers in OrchestratorServer.wireEvents and
    // unsubscribes itself in server.stop, but clearListeners() is the
    // belt-and-suspenders second line in case a future subscriber forgets).
    // Run BEFORE nulling so the bus reference is still valid.
    this.routingDecisionBus?.clearListeners();
    // Null out the bus reference; ring buffer + listener set are
    // eligible for GC once no external references remain.
    this.routingDecisionBus = null;
    // Consumption Phase 1 (T2): detach the pool-refresh bus listener before
    // stopping resolvers so a late emit can't re-arm a stopped resolver's timer.
    if (this.poolRefreshListener !== null) {
      this.removeListener('local-models:pool', this.poolRefreshListener);
      this.poolRefreshListener = null;
    }
    for (const resolver of this.localResolvers.values()) {
      resolver.stop();
    }
    // LMLM Phase 6: disarm the background refresh scheduler (no further ticks).
    this.refreshScheduler?.stop();
    this.refreshScheduler = null;
    if (this.maintenanceScheduler) {
      this.maintenanceScheduler.stop();
      this.maintenanceScheduler = null;
    }
    if (this.webhookFanoutOff) {
      this.webhookFanoutOff();
      delete this.webhookFanoutOff;
    }
    // Hermes Phase 3: detach the notification listeners before the
    // registry disposes so no in-flight emit pulls from a torn-down
    // adapter. The deliver() promises that are already mid-flight resolve
    // independently; their results no longer route to listeners.
    if (this.notificationFanoutOff) {
      this.notificationFanoutOff();
      delete this.notificationFanoutOff;
    }
    if (this.notificationsRegistry) {
      await this.notificationsRegistry.dispose();
      delete this.notificationsRegistry;
    }
    // Phase 5: tear down telemetry fanout BEFORE the delivery worker so
    // late-arriving bus events do not enqueue into a draining queue.
    if (this.telemetryFanoutOff) {
      this.telemetryFanoutOff();
      delete this.telemetryFanoutOff;
    }
    if (this.otlpExporter) {
      // exporter.stop() flushes remaining buffered spans before resolving.
      await this.otlpExporter.stop();
      delete this.otlpExporter;
    }
    if (this.webhookDeliveryWorker) {
      // Drain in-flight HTTP deliveries before closing the SQLite handle.
      await this.webhookDeliveryWorker.stop();
      delete this.webhookDeliveryWorker;
    }
    if (this.webhookQueue) {
      this.webhookQueue.close();
      delete this.webhookQueue;
    }
    if (this.server) {
      this.server.stop();
    }
    this.logger.info('Orchestrator stopped.');
  }

  /** Update tick activity and broadcast the change to connected clients. */
  private setTickActivity(
    phase: 'idle' | 'fetching' | 'analyzing' | 'dispatching',
    detail?: string,
    progress?: { current: number; total: number }
  ): void {
    this.tickActivity = { phase, detail: detail ?? null, progress: progress ?? null };
    this.emit('state_change', this.getSnapshot());
  }

  /**
   * Returns a point-in-time snapshot of the orchestrator's internal state.
   */
  public getSnapshot(): Record<string, unknown> {
    const now = Date.now();
    let secondsRunning = 0;
    for (const [, entry] of this.state.running) {
      secondsRunning += (now - new Date(entry.startedAt).getTime()) / 1000;
    }

    return {
      running: Array.from(this.state.running.entries()),
      retryAttempts: Array.from(this.state.retryAttempts.entries()),
      claimed: Array.from(this.state.claimed),
      completed: Array.from(this.state.completed.keys()),
      tokenTotals: { ...this.state.tokenTotals, secondsRunning },
      maxConcurrentAgents: this.state.maxConcurrentAgents,
      globalCooldownUntilMs: this.state.globalCooldownUntilMs,
      recentRequestTimestamps: this.state.recentRequestTimestamps,
      recentInputTokens: this.state.recentInputTokens,
      recentOutputTokens: this.state.recentOutputTokens,
      maxRequestsPerMinute: this.state.maxRequestsPerMinute,
      maxRequestsPerSecond: this.state.maxRequestsPerSecond,
      maxInputTokensPerMinute: this.state.maxInputTokensPerMinute,
      maxOutputTokensPerMinute: this.state.maxOutputTokensPerMinute,
      claimRejections: this.state.claimRejections,
      tickActivity: this.tickActivity,
    };
  }

  /**
   * Spec B Phase 4 (D8): expose the bus for Phase 5 (HTTP routes) and
   * Phase 7 (dashboard WS broadcast). Returns null when the legacy
   * single-backend config bypassed agent.backends synthesis.
   */
  public getRoutingDecisionBus(): RoutingDecisionBus | null {
    return this.routingDecisionBus;
  }

  /**
   * AMR Phase 3 (D11): the opt-in adaptive router, or `null` when no
   * `routing.policy` is configured (the default-off path). Exposed for the
   * SC8/SC17/SC19 default-off proof: `null` here means dispatch stays on the
   * shipped `BackendRouter`, byte-identical, with no classify()/telemetry.
   */
  public getAdaptiveRouter(): AdaptiveRouter | null {
    return this.adaptiveRouter;
  }

  /**
   * AMR Phase 3 (D11) / Phase 5 (D1): construct the opt-in AdaptiveRouter for a
   * policy. Extracted from the constructor so runtime ingestion
   * (`ingestRoutingPolicy`) builds a router IDENTICAL to the constructor's —
   * same live classify seam, strong-cap escalation-exhaustion hard-fail-to-human
   * (D10), and enriched-decision bus (SC9). Precondition: the routing subsystem
   * exists (`backendFactory` + `agent.backends` present); callers guard.
   */
  private buildAdaptiveRouter(policy: RoutingPolicy): AdaptiveRouter {
    const factory = this.backendFactory;
    const backends = this.config.agent.backends;
    if (factory === null || backends === undefined) {
      throw new Error('AdaptiveRouter requires a backend factory and agent.backends');
    }
    return AdaptiveRouter.fromConfig({
      router: factory.getRouter(),
      backends,
      ...(this.modelPool ? { pool: this.modelPool } : {}),
      policy,
      // The REAL intelligence cascade (final-review finding #2): reads
      // `req.taskText`, runs the static pre-diff pass, and spends a fast-tier LLM
      // tie-break only when a provider is available AND the static verdict is
      // low-confidence. Provider resolved lazily (built in start()); classifySafe
      // guards any throw/timeout so classification never blocks dispatch (D4).
      classify: makeLiveClassify(() => this.resolveComplexityProvider()),
      // D10 strong-cap exhaustion: once the floor is already `strong` and a
      // quality failure re-crosses the threshold, there is no higher tier — the
      // coherence unit surfaces to a human (not merely a log line).
      onExhausted: (coherenceUnit: string) => {
        const err = new RoutingError(
          'escalation-exhausted',
          `Coherence unit ${coherenceUnit} exhausted the strong tier ceiling: quality failures re-crossed the escalation threshold with no higher tier to climb to (D10/SC16)`
        );
        this.logger.warn('routing:escalation-exhausted', {
          coherenceUnit,
          reason: err.message,
        });
        this.escalateRoutingToHuman(coherenceUnit, err);
      },
      // SC9: emit the ENRICHED decision onto the same bus dispatch uses.
      ...(this.routingDecisionBus ? { decisionBus: this.routingDecisionBus } : {}),
    });
  }

  /**
   * AMR Phase 5 (D1/D5): ingest a routing policy pushed at runtime by the
   * Shuttle control plane (`PUT /api/v1/routing/policy`). Hot-swaps the live
   * router:
   *   - empty policy (`{}` / no activating fields) → `adaptiveRouter = null`
   *     (default-off restored, D5 — byte-identical dispatch resumes);
   *   - an existing router → `setPolicy` (preserves the accumulated
   *     `EscalationState` climbed floors — a policy edit must not reset them);
   *   - no router yet → construct one from the pushed policy.
   *
   * The field-swap is atomic between `await`s (single-threaded): a dispatch that
   * already captured the router finishes on it; the next dispatch sees the new
   * policy. No-op-safe when the routing subsystem is absent (`backendFactory`
   * null) — the caller (`PUT` handler) reports 503 in that case, so this path is
   * reached only when routing is available.
   */
  public ingestRoutingPolicy(policy: RoutingPolicy): void {
    if (Object.keys(policy).length === 0) {
      this.adaptiveRouter = null;
      return;
    }
    if (this.backendFactory === null) {
      // No routing subsystem — nothing to route. Leave default-off.
      this.adaptiveRouter = null;
      return;
    }
    if (this.adaptiveRouter !== null) {
      this.adaptiveRouter.setPolicy(policy);
    } else {
      this.adaptiveRouter = this.buildAdaptiveRouter(policy);
    }
  }

  /**
   * AMR Phase 5 (D2): project the live router's enriched decision ring into the
   * Shuttle telemetry wire shape (`GET /api/v1/routing/telemetry`). Returns an
   * empty payload when routing is off (no router) — a safe, idempotent read.
   */
  public getRoutingTelemetry(): RoutingTelemetry {
    return this.adaptiveRouter?.projectTelemetry() ?? { decisions: [], spentUsd: 0 };
  }

  /**
   * AMR observability: the live operator status (budget spend-vs-cap, escalated
   * units, allowlist), or an inactive payload when AMR is off. Backs
   * `GET /api/v1/routing/status`.
   */
  public getRoutingStatus(): RoutingStatus {
    return (
      this.adaptiveRouter?.getStatus() ?? {
        active: false,
        budget: null,
        escalation: [],
        allowedProviders: null,
      }
    );
  }

  /**
   * Spec B Phase 5: live BackendRouter for HTTP routes. The orchestrator
   * dispatch path uses the factory-owned router directly; observability
   * routes (config / decisions) reach it through this accessor. Returns
   * null when the legacy single-backend config bypassed agent.backends
   * synthesis (no backendFactory built).
   */
  public getBackendRouter(): import('./agent/backend-router').BackendRouter | null {
    return this.backendFactory?.getRouter() ?? null;
  }

  /**
   * Spec B Phase 5: snapshot of the active RoutingConfig for the config
   * route and the trace route's bus-less router construction. Returns
   * null when the operator's harness.config.json carries no
   * `agent.routing` block.
   */
  public getRoutingConfig(): import('@harness-engineering/types').RoutingConfig | null {
    return this.config.agent.routing ?? null;
  }

  /**
   * Spec B Phase 5: snapshot of `agent.backends` for the config route
   * (existence annotations) and the trace route (bus-less router
   * construction). Returns null when no synthesized backends map exists
   * (legacy single-backend configs).
   */
  public getBackends(): Record<string, import('@harness-engineering/types').BackendDef> | null {
    return this.config.agent.backends ?? null;
  }

  /** Returns the maintenance scheduler status, or null if maintenance is not enabled. */
  public getMaintenanceStatus(): import('./maintenance/types').MaintenanceStatus | null {
    return this.maintenanceScheduler?.getStatus() ?? null;
  }
}
