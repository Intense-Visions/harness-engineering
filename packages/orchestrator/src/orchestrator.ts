import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkflowConfig, AgentBackend } from '@harness-engineering/types';
import type { Issue, IssueTrackerClient } from '@harness-engineering/core';
import { writeTaint } from '@harness-engineering/core';
import { IntelligencePipeline } from '@harness-engineering/intelligence';
import type { EnrichedSpec } from '@harness-engineering/intelligence';
import { GraphStore } from '@harness-engineering/graph';
import type { OrchestratorState, LiveSession } from './types/internal';
import type { OrchestratorEvent, SideEffect } from './types/events';
import { applyEvent } from './core/state-machine';
import { createEmptyState } from './core/state-helpers';
import { AnalysisArchive } from './core/analysis-archive';
import { IntelligencePipelineRunner } from './intelligence/pipeline-runner';
import { CompletionHandler } from './completion/handler';
import type { OrchestratorContext } from './types/orchestrator-context';
import {
  GitHubIssuesSyncAdapter,
  loadTrackerSyncConfig,
  createTrackerClient,
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
import { LocalModelResolver } from './agent/local-model-resolver';
import { migrateAgentConfig } from './agent/config-migration';
import { OrchestratorBackendFactory } from './agent/orchestrator-backend-factory';
import { buildIntelligencePipeline } from './agent/intelligence-factory';
import { detectScopeTier, artifactPresenceFromIssue } from './core/model-router';
import { OrchestratorServer } from './server/http';
import { StructuredLogger } from './logging/logger';
import { scanWorkspaceConfig } from './workspace/config-scanner';
import { InteractionQueue } from './core/interaction-queue';
import { computeRateLimitDelay } from './core/rate-limiter';
import type { EscalateEffect, ClaimEffect } from './types/events';
import { ClaimManager } from './core/claim-manager';
import { PRDetector, type ExecFileFn } from './core/pr-detector';
import { MaintenanceScheduler } from './maintenance/scheduler';
import { SingleProcessLeaderElector } from './maintenance/leader-elector';
import { MaintenanceReporter } from './maintenance/reporter';
import { TaskRunner } from './maintenance/task-runner';
import type {
  CheckCommandRunner,
  AgentDispatcher,
  CommandExecutor,
} from './maintenance/task-runner';
import { resolveOrchestratorId } from './core/orchestrator-identity';
import { StreamRecorder } from './core/stream-recorder';

/**
 * The central orchestrator that manages the lifecycle of coding agents.
 *
 * It polls an issue tracker for candidate tasks, manages ephemeral workspaces,
 * runs agents to resolve issues, and updates the tracker with progress.
 *
 * @fires Orchestrator#state_change Emitted when the internal state machine transitions
 * @fires Orchestrator#agent_event Emitted when an agent produces an output or thought
 */
function useCaseForBackendParam(
  issue: Issue,
  backendParam: 'local' | 'primary' | undefined
): import('@harness-engineering/types').RoutingUseCase {
  // Spec 2 SC30 / Task 12: translate the legacy
  // `dispatchIssue(..., backend?)` parameter into a `RoutingUseCase` for
  // the BackendRouter.
  //   - 'local' → quick-fix tier (typical local-backend assignment in
  //     legacy single-runner configs).
  //   - undefined / 'primary' → the issue's own scope tier, computed
  //     identically to the state machine's escalation gate
  //     (core/state-machine.ts), so escalation and routing always see
  //     the same tier (SC43: escalation governs *whether*, routing
  //     governs *where*).
  // Module-level so SC30 mechanical greps at the dispatch site stay
  // clean. Eliminating the legacy `backend?` parameter is autopilot
  // Phase 4+.
  if (backendParam === 'local') return { kind: 'tier', tier: 'quick-fix' };
  const tier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
  return { kind: 'tier', tier };
}

export class Orchestrator extends EventEmitter {
  private state: OrchestratorState;
  private config: WorkflowConfig;
  private tracker: IssueTrackerClient;
  private workspace: WorkspaceManager;
  private hooks: WorkspaceHooks;
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
   * Test-only: when overrides.backend is provided, dispatch uses this
   * instance directly (bypassing the factory). Mirrors Phase 1
   * `overrides.backend → this.runner.backend` behavior so existing
   * MockBackend-injection tests keep working without touching the
   * factory's routing path.
   */
  private overrideBackend: AgentBackend | null;
  private renderer: PromptRenderer;
  private promptTemplate: string;
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
   * Per-resolver `onStatusChange` unsubscribe callbacks. Spec 2 Phase 5
   * (SC39): each local/pi resolver gets its own listener emitting a
   * `NamedLocalModelStatus` event tagged with `backendName` + `endpoint`.
   * The previous single-resolver field (`localModelStatusUnsubscribe`)
   * is replaced by this list so multi-local configs can teardown all
   * listeners on `stop()` without a Map mutation.
   */
  private localModelStatusUnsubscribes: Array<() => void> = [];
  private pipeline: IntelligencePipeline | null;
  private analysisArchive: AnalysisArchive;
  private graphStore: GraphStore | null = null;
  private claimManager: ClaimManager | null = null;
  private prDetector: PRDetector;
  private maintenanceScheduler: MaintenanceScheduler | null = null;
  private maintenanceReporter: MaintenanceReporter | null = null;
  private orchestratorIdPromise: Promise<string>;
  private recorder: StreamRecorder;
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
    overrides?: { tracker?: IssueTrackerClient; backend?: AgentBackend; execFileFn?: ExecFileFn }
  ) {
    super();
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

    // Initialize adapters based on config or overrides
    this.tracker = overrides?.tracker || this.createTracker();
    this.workspace = new WorkspaceManager(config.workspace, {
      emitEvent: (event) => {
        // Phase 3 / spec D6 / R4: surface worktree base-ref fallback in
        // the same maintenance/event stream the dashboard subscribes to.
        // Two parallel channels mirror the maintenance task pattern at
        // orchestrator.ts:520-534: WebSocket fan-out + Node EventEmitter.
        this.server?.broadcastMaintenance('maintenance:baseref_fallback', event);
        this.emit('maintenance:baseref_fallback', event);
      },
    });
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
    const backendsMap = this.config.agent.backends ?? {};
    for (const [name, def] of Object.entries(backendsMap)) {
      if (def.type === 'local' || def.type === 'pi') {
        const resolverOpts: import('./agent/local-model-resolver').LocalModelResolverOptions = {
          endpoint: def.endpoint,
          configured: typeof def.model === 'string' ? [def.model] : def.model,
          logger: this.logger,
        };
        if (def.apiKey !== undefined) resolverOpts.apiKey = def.apiKey;
        if (def.probeIntervalMs !== undefined) resolverOpts.probeIntervalMs = def.probeIntervalMs;
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
      this.backendFactory = new OrchestratorBackendFactory({
        backends: this.config.agent.backends,
        routing,
        sandboxPolicy,
        ...(this.config.agent.container !== undefined
          ? { container: this.config.agent.container }
          : {}),
        ...(this.config.agent.secrets !== undefined ? { secrets: this.config.agent.secrets } : {}),
        getResolverModelFor: (name) => {
          const resolver = this.localResolvers.get(name);
          return resolver ? () => resolver.resolveModel() : undefined;
        },
      });
    } else {
      this.backendFactory = null;
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
      this.server = new OrchestratorServer(this, config.server.port, {
        interactionQueue: this.interactionQueue,
        plansDir: path.resolve(config.workspace.root, '..', 'docs', 'plans'),
        pipeline: this.pipeline,
        analysisArchive: this.analysisArchive,
        roadmapPath: config.tracker.filePath ?? null,
        dispatchAdHoc: this.dispatchAdHoc.bind(this),
        getLocalModelStatus: () => {
          // Deprecated alias for /api/v1/local-model/status (Spec 1 endpoint
          // retained as a compat shim per spec line 35; superseded by
          // getLocalModelStatuses for the multi-local UI). Returns the
          // first-registered resolver's status.
          const first = this.localResolvers.values().next();
          return first.done ? null : first.value.getStatus();
        },
        getLocalModelStatuses: () => {
          // SC38: build NamedLocalModelStatus[] from each registered resolver,
          // tagged with its backendName + endpoint from the config.
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
        },
      });

      this.server.setRecorder(this.recorder);

      // Wire interaction push -> WebSocket broadcast
      this.interactionQueue.onPush((interaction) => {
        this.server?.broadcastInteraction(interaction);
      });
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
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        const [cmd, ...args] = command;
        if (!cmd) return { passed: true, findings: 0, output: '' };

        try {
          const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 120_000 });
          // Try to extract a findings count from the output (common patterns: "N findings", "N issues")
          const findingsMatch = stdout.match(/(\d+)\s+(?:finding|issue|violation|error)/i);
          const findings = findingsMatch ? parseInt(findingsMatch[1]!, 10) : 0;
          return { passed: findings === 0, findings, output: stdout };
        } catch (err) {
          const error = err as { stdout?: string; stderr?: string; code?: number };
          const output = [error.stdout, error.stderr].filter(Boolean).join('\n');
          const findingsMatch = output.match(/(\d+)\s+(?:finding|issue|violation|error)/i);
          const findings = findingsMatch ? parseInt(findingsMatch[1]!, 10) : 1;
          return { passed: false, findings, output };
        }
      },
    };

    const agentDispatcher: AgentDispatcher = {
      dispatch: async (skill: string, branch: string, backendName: string, cwd: string) => {
        logger.info(
          'Maintenance agent dispatcher invoked (stub — skill dispatch integration pending)',
          {
            skill,
            branch,
            backendName,
            cwd,
          }
        );
        return { producedCommits: false, fixed: 0 };
      },
    };

    const commandExecutor: CommandExecutor = {
      exec: async (command: string[], cwd: string) => {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        const [cmd, ...args] = command;
        if (!cmd) return { stdout: '' };

        try {
          const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 120_000 });
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

    return new TaskRunner({
      config: maintenanceConfig,
      checkRunner,
      agentDispatcher,
      commandExecutor,
      cwd: this.projectRoot,
    });
  }

  /**
   * Initializes the maintenance subsystem: reporter, scheduler, and server route wiring.
   * Extracted from start() to keep function length under threshold.
   */
  private async initMaintenance(
    maintenanceConfig: import('@harness-engineering/types').MaintenanceConfig
  ): Promise<void> {
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
    const bundle = buildIntelligencePipeline({
      config: this.config,
      localResolvers: this.localResolvers,
      logger: this.logger,
    });
    if (!bundle) return null;
    this.graphStore = bundle.graphStore;
    return bundle.pipeline;
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
    const tickEvent: OrchestratorEvent = {
      type: 'tick' as const,
      candidates,
      runningStates: runningStatesResult.value,
      nowMs,
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
    //     invalidating any live Map iterator.
    const stallTimeoutMs = this.config.agent.stallTimeoutMs;
    if (stallTimeoutMs > 0) {
      const stalledIds: string[] = [];
      for (const [runId, runEntry] of this.state.running) {
        const lastTs = runEntry.session?.lastTimestamp;
        if (!lastTs) continue; // No events yet — still initializing
        const silentMs = nowMs - new Date(lastTs).getTime();
        if (silentMs >= stallTimeoutMs) {
          stalledIds.push(runId);
        }
      }
      for (const runId of stalledIds) {
        // Re-read from current state — a prior stall may have already removed this entry
        const runEntry = this.state.running.get(runId);
        if (!runEntry) continue;
        this.logger.warn(
          `Agent stalled for ${runEntry.identifier}: ${Math.round((nowMs - new Date(runEntry.session?.lastTimestamp ?? 0).getTime()) / 1000)}s since last event`,
          { issueId: runId }
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
        break;
      case 'claim':
        await this.handleClaimEffect(effect as ClaimEffect);
        break;
    }
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
   * Delegates to PRDetector.filterCandidatesWithOpenPRs.
   * @see PRDetector#filterCandidatesWithOpenPRs
   */
  private async filterCandidatesWithOpenPRs(candidates: Issue[]): Promise<Issue[]> {
    return this.prDetector.filterCandidatesWithOpenPRs(candidates);
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

    // Claim succeeded — post claim comment to GitHub issue, then dispatch
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
   * Dispatches a new agent to work on an issue.
   *
   * @param issue - The issue to resolve
   * @param attempt - The retry attempt number
   */
  private async dispatchIssue(
    issue: Issue,
    attempt: number | null,
    backend?: 'local' | 'primary'
  ): Promise<void> {
    this.logger.info(`Dispatching issue: ${issue.identifier} (attempt ${attempt})`, {
      issueId: issue.id,
    });

    try {
      // 1. Ensure workspace
      const workspaceResult = await this.workspace.ensureWorkspace(issue.identifier);
      if (!workspaceResult.ok) throw workspaceResult.error;
      const workspacePath = workspaceResult.value;

      // 1b. Run afterCreate hook (workspace just created/recreated)
      const afterCreateResult = await this.hooks.afterCreate(workspacePath);
      if (!afterCreateResult.ok) {
        this.logger.warn(
          `afterCreate hook failed for ${issue.identifier}: ${afterCreateResult.error.message}`
        );
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

      // 4. Render prompt
      const prompt = await this.renderer.render(this.promptTemplate, {
        issue,
        attempt: attempt || 1,
      });

      // 5. Resolve the routed backend NAME up front so the LiveSession
      //    + recorder are labelled with it (Spec 2 P2-I2). Reading
      //    `this.config.agent.backend` directly returns `undefined` for
      //    pure-modern configs (only `agent.backends` set), which would
      //    surface as `undefined` in dashboard telemetry + stream
      //    metadata. The router's `resolveName` is total: post-migration
      //    every `routing` slot maps to a known backend in `backends`.
      const useCase = useCaseForBackendParam(issue, backend);
      let routedBackendName: string;
      if (this.overrideBackend !== null) {
        routedBackendName = this.overrideBackend.name;
      } else if (this.backendFactory !== null) {
        routedBackendName = this.backendFactory.resolveName(useCase);
      } else {
        // Legacy-fallback path: factory absent because migration threw.
        // Prefer `routing.default` if migration partially succeeded;
        // otherwise fall back to legacy `agent.backend` (still a string
        // when this branch is reachable: migration only throws on
        // legacy configs that have `agent.backend` set).
        routedBackendName =
          this.config.agent.routing?.default ?? this.config.agent.backend ?? 'unknown';
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
      } else if (this.backendFactory !== null) {
        agentBackend = this.backendFactory.forUseCase(useCase);
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
      this.runAgentInBackgroundTask(issue, workspacePath, prompt, attempt, activeRunner);
    } catch (error) {
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
    runner: AgentRunner
  ): void {
    // Spec 2 SC30 / Task 12: `runner` is now required. The previous
    // `runner ?? this.runner` fallback is gone with the field removal.
    const activeRunner = runner;
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
          await this.emitWorkerExit(issue.id, 'normal', attempt);
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
   * Informs the state machine that an agent worker has exited.
   */
  private async emitWorkerExit(
    issueId: string,
    reason: 'normal' | 'error',
    attempt: number | null,
    error?: string
  ): Promise<void> {
    await this.completionHandler.handleWorkerExit(issueId, reason, attempt, error, (effect) =>
      this.handleEffect(effect)
    );
    this.emit('state_change', this.getSnapshot());
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
      for (const resolver of this.localResolvers.values()) {
        await resolver.start();
      }
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
    if (this.server) {
      void this.server.start();
    }

    await this.initLocalModelAndPipeline();

    // Resolve orchestrator identity and initialize ClaimManager before first tick
    await this.ensureClaimManager();

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
    for (const resolver of this.localResolvers.values()) {
      resolver.stop();
    }
    if (this.maintenanceScheduler) {
      this.maintenanceScheduler.stop();
      this.maintenanceScheduler = null;
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

  /** Returns the maintenance scheduler status, or null if maintenance is not enabled. */
  public getMaintenanceStatus(): import('./maintenance/types').MaintenanceStatus | null {
    return this.maintenanceScheduler?.getStatus() ?? null;
  }
}
