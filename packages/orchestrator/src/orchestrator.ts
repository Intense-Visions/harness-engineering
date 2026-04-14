import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import {
  WorkflowConfig,
  Issue,
  IssueTrackerClient,
  AgentBackend,
} from '@harness-engineering/types';
import { writeTaint } from '@harness-engineering/core';
import {
  OrchestratorState,
  OrchestratorEvent,
  SideEffect,
  applyEvent,
  createEmptyState,
  LiveSession,
} from './core/index';
import { RoadmapTrackerAdapter } from './tracker/adapters/roadmap';
import { WorkspaceManager } from './workspace/manager';
import { WorkspaceHooks } from './workspace/hooks';
import { AgentRunner } from './agent/runner';
import { PromptRenderer } from './prompt/renderer';
import { MockBackend } from './agent/backends/mock';
import { ClaudeBackend } from './agent/backends/claude';
import { OpenAIBackend } from './agent/backends/openai';
import { GeminiBackend } from './agent/backends/gemini';
import { AnthropicBackend } from './agent/backends/anthropic';
import { LocalBackend } from './agent/backends/local';
import { OrchestratorServer } from './server/http';
import { StructuredLogger } from './logging/logger';
import { scanWorkspaceConfig } from './workspace/config-scanner';
import { InteractionQueue } from './core/interaction-queue';
import type { EscalateEffect } from './types/events';

/**
 * The central orchestrator that manages the lifecycle of coding agents.
 *
 * It polls an issue tracker for candidate tasks, manages ephemeral workspaces,
 * runs agents to resolve issues, and updates the tracker with progress.
 *
 * @fires Orchestrator#state_change Emitted when the internal state machine transitions
 * @fires Orchestrator#agent_event Emitted when an agent produces an output or thought
 */
export class Orchestrator extends EventEmitter {
  private state: OrchestratorState;
  private config: WorkflowConfig;
  private tracker: IssueTrackerClient;
  private workspace: WorkspaceManager;
  private hooks: WorkspaceHooks;
  private runner: AgentRunner;
  private renderer: PromptRenderer;
  private promptTemplate: string;
  private server?: OrchestratorServer;
  private interval?: NodeJS.Timeout | undefined;
  private logger: StructuredLogger;
  private interactionQueue: InteractionQueue;
  private localRunner: AgentRunner | null;

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
    overrides?: { tracker?: IssueTrackerClient; backend?: AgentBackend }
  ) {
    super();
    this.config = config;
    this.promptTemplate = promptTemplate;
    this.state = createEmptyState(config);
    this.logger = new StructuredLogger();

    // Initialize adapters based on config or overrides
    this.tracker = overrides?.tracker || this.createTracker();
    this.workspace = new WorkspaceManager(config.workspace);
    this.hooks = new WorkspaceHooks(config.hooks);
    this.renderer = new PromptRenderer();
    this.runner = new AgentRunner(overrides?.backend || this.createBackend(), {
      maxTurns: config.agent.maxTurns,
    });

    this.interactionQueue = new InteractionQueue(
      path.join(config.workspace.root, '..', 'interactions')
    );

    const localBackend = this.createLocalBackend();
    this.localRunner = localBackend
      ? new AgentRunner(localBackend, { maxTurns: config.agent.maxTurns })
      : null;

    if (config.server?.port) {
      this.server = new OrchestratorServer(this, config.server.port, {
        interactionQueue: this.interactionQueue,
        plansDir: path.resolve(config.workspace.root, '..', 'docs', 'plans'),
      });

      // Wire interaction push -> WebSocket broadcast
      this.interactionQueue.onPush((interaction) => {
        this.server?.broadcastInteraction(interaction);
      });
    }
  }

  private createTracker(): IssueTrackerClient {
    if (this.config.tracker.kind === 'roadmap') {
      return new RoadmapTrackerAdapter(this.config.tracker);
    }
    throw new Error(`Unsupported tracker kind: ${this.config.tracker.kind}`);
  }

  private createBackend(): AgentBackend {
    if (this.config.agent.backend === 'mock') {
      return new MockBackend();
    } else if (this.config.agent.backend === 'claude') {
      return new ClaudeBackend(this.config.agent.command);
    } else if (this.config.agent.backend === 'openai') {
      return new OpenAIBackend({
        ...(this.config.agent.model !== undefined && { model: this.config.agent.model }),
        ...(this.config.agent.apiKey !== undefined && { apiKey: this.config.agent.apiKey }),
      });
    } else if (this.config.agent.backend === 'gemini') {
      return new GeminiBackend({
        ...(this.config.agent.model !== undefined && { model: this.config.agent.model }),
        ...(this.config.agent.apiKey !== undefined && { apiKey: this.config.agent.apiKey }),
      });
    } else if (this.config.agent.backend === 'anthropic') {
      return new AnthropicBackend({
        ...(this.config.agent.model !== undefined && { model: this.config.agent.model }),
        ...(this.config.agent.apiKey !== undefined && { apiKey: this.config.agent.apiKey }),
      });
    }
    throw new Error(`Unsupported agent backend: ${this.config.agent.backend}`);
  }

  private createLocalBackend(): AgentBackend | null {
    if (this.config.agent.localBackend === 'openai-compatible') {
      const localConfig: import('./agent/backends/local').LocalBackendConfig = {};
      if (this.config.agent.localEndpoint) localConfig.endpoint = this.config.agent.localEndpoint;
      if (this.config.agent.localModel) localConfig.model = this.config.agent.localModel;
      if (this.config.agent.localApiKey) localConfig.apiKey = this.config.agent.localApiKey;
      return new LocalBackend(localConfig);
    }
    return null;
  }

  public async asyncTick(): Promise<void> {
    const nowMs = Date.now();

    // 1. Fetch candidates from tracker
    const candidatesResult = await this.tracker.fetchCandidateIssues();
    if (!candidatesResult.ok) {
      this.logger.error('Failed to fetch candidate issues', {
        error: String(candidatesResult.error),
      });
      return;
    }

    // 2. Fetch current status for running issues
    const runningIds = Array.from(this.state.running.keys());
    const runningStatesResult = await this.tracker.fetchIssueStatesByIds(runningIds);
    if (!runningStatesResult.ok) {
      this.logger.error('Failed to fetch running issue states', {
        error: String(runningStatesResult.error),
      });
      return;
    }

    // 3. Dispatch tick event to state machine
    const tickEvent: OrchestratorEvent = {
      type: 'tick',
      candidates: candidatesResult.value,
      runningStates: runningStatesResult.value,
      nowMs,
    };

    let { nextState, effects } = applyEvent(this.state, tickEvent, this.config);
    this.state = nextState;

    // 4. Check for due retries
    for (const [issueId, retry] of nextState.retryAttempts.entries()) {
      if (nowMs >= retry.dueAtMs) {
        const retryEvent: OrchestratorEvent = {
          type: 'retry_fired',
          issueId,
          candidates: candidatesResult.value,
          nowMs,
        };
        const result = applyEvent(this.state, retryEvent, this.config);
        this.state = result.nextState;
        effects.push(...result.effects);
      }
    }

    // 5. Handle effects
    for (const effect of effects) {
      await this.handleEffect(effect);
    }

    this.emit('state_change', this.getSnapshot());
  }

  public async tick(): Promise<void> {
    await this.asyncTick();
  }

  /**
   * Processes a side effect generated by the state machine.
   *
   * @param effect - The effect to handle
   */
  private async handleEffect(effect: SideEffect): Promise<void> {
    switch (effect.type) {
      case 'dispatch':
        await this.dispatchIssue(effect.issue, effect.attempt, effect.backend);
        break;
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
      case 'cleanWorkspace':
        await this.workspace.removeWorkspace(effect.identifier);
        break;
      case 'escalate':
        await this.handleEscalation(effect as EscalateEffect);
        break;
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
      id: `interaction-${Date.now()}-${effect.issueId.slice(0, 8)}`,
      issueId: effect.issueId,
      type: 'needs-human',
      reasons: effect.reasons,
      context: {
        issueTitle: effect.issueTitle ?? effect.identifier,
        issueDescription: effect.issueDescription ?? null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
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

      // 5. Start agent session (in background)
      const session: LiveSession = {
        sessionId: `pending-${Date.now()}`,
        backendName: this.config.agent.backend,
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

      const activeRunner = backend === 'local' && this.localRunner ? this.localRunner : this.runner;
      this.runAgentInBackgroundTask(issue, workspacePath, prompt, attempt, activeRunner);
    } catch (error) {
      this.logger.error(`Dispatch failed for ${issue.identifier}`, { error: String(error) });
      await this.emitWorkerExit(issue.id, 'error', attempt, String(error));
    }
  }

  private runAgentInBackgroundTask(
    issue: Issue,
    workspacePath: string,
    prompt: string,
    attempt: number | null,
    runner?: AgentRunner
  ): void {
    const activeRunner = runner ?? this.runner;
    this.logger.info(`Starting background task for ${issue.identifier}`);
    (async () => {
      try {
        this.logger.info(`Calling runner.runSession for ${issue.identifier}`);
        const sessionGen = activeRunner.runSession(issue, workspacePath, prompt);
        for await (const event of sessionGen) {
          this.logger.info(`Received event from ${issue.identifier}: ${event.type}`);
          // 1. Update internal state machine
          const updateEvent: OrchestratorEvent = {
            type: 'agent_update',
            issueId: issue.id,
            event,
          };
          const { nextState, effects } = applyEvent(this.state, updateEvent, this.config);
          this.state = nextState;

          // 2. Handle side effects (like updating token totals)
          for (const effect of effects) {
            await this.handleEffect(effect);
          }

          // 3. Emit events for TUI/Observability
          this.emit('agent_event', { issueId: issue.id, event });
          this.emit('state_change', this.getSnapshot());

          // 4. Pause if we need to before starting a new turn
          if (event.type === 'turn_start') {
            while (true) {
              const now = Date.now();
              let waitTime = 0;

              if (this.state.globalCooldownUntilMs && now < this.state.globalCooldownUntilMs) {
                waitTime = this.state.globalCooldownUntilMs - now;
              } else {
                const recentCountMin = this.state.recentRequestTimestamps.filter(
                  (ts) => now - ts < 60000
                ).length;
                const recentCountSec = this.state.recentRequestTimestamps.filter(
                  (ts) => now - ts < 1000
                ).length;

                const recentInputTokensFilter = this.state.recentInputTokens.filter(
                  (t) => now - t.timestamp < 60000
                );
                const recentOutputTokensFilter = this.state.recentOutputTokens.filter(
                  (t) => now - t.timestamp < 60000
                );

                const minInputTokens = recentInputTokensFilter.reduce(
                  (sum, t) => sum + t.tokens,
                  0
                );
                const minOutputTokens = recentOutputTokensFilter.reduce(
                  (sum, t) => sum + t.tokens,
                  0
                );

                if (recentCountMin > this.state.maxRequestsPerMinute) {
                  const timestamps = this.state.recentRequestTimestamps
                    .filter((ts) => now - ts < 60000)
                    .sort((a, b) => a - b);
                  const oldest = timestamps[0];
                  if (oldest !== undefined) {
                    waitTime = 60000 - (now - oldest);
                  } else {
                    waitTime = 1000;
                  }
                } else if (recentCountSec >= this.state.maxRequestsPerSecond) {
                  const timestamps = this.state.recentRequestTimestamps
                    .filter((ts) => now - ts < 1000)
                    .sort((a, b) => a - b);
                  const oldest = timestamps[0];
                  if (oldest !== undefined) {
                    waitTime = 1000 - (now - oldest);
                  } else {
                    waitTime = 1000;
                  }
                } else if (
                  this.state.maxInputTokensPerMinute > 0 &&
                  minInputTokens >= this.state.maxInputTokensPerMinute
                ) {
                  const sorted = recentInputTokensFilter.sort((a, b) => a.timestamp - b.timestamp);
                  const oldest = sorted[0]?.timestamp;
                  if (oldest !== undefined) {
                    waitTime = 60000 - (now - oldest);
                  } else {
                    waitTime = 1000;
                  }
                } else if (
                  this.state.maxOutputTokensPerMinute > 0 &&
                  minOutputTokens >= this.state.maxOutputTokensPerMinute
                ) {
                  const sorted = recentOutputTokensFilter.sort((a, b) => a.timestamp - b.timestamp);
                  const oldest = sorted[0]?.timestamp;
                  if (oldest !== undefined) {
                    waitTime = 60000 - (now - oldest);
                  } else {
                    waitTime = 1000;
                  }
                }
              }

              if (waitTime > 0) {
                this.logger.info(
                  `Rate limit throttling active, pausing ${issue.identifier} for ${waitTime}ms`
                );
                await new Promise((r) => setTimeout(r, waitTime));
              } else {
                break;
              }
            }
          }
        }
        this.logger.info(`Session generator finished for ${issue.identifier}`);
        // When finished, emit success to state machine
        await this.emitWorkerExit(issue.id, 'normal', attempt);
      } catch (error) {
        this.logger.error(`Agent runner failed for ${issue.identifier}`, { error: String(error) });
        await this.emitWorkerExit(issue.id, 'error', attempt, String(error));
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
    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId,
      reason,
      error,
      attempt,
    };
    const { nextState, effects } = applyEvent(this.state, event, this.config);
    this.state = nextState;

    // Process side effects immediately and await them
    for (const effect of effects) {
      await this.handleEffect(effect);
    }
    this.emit('state_change', this.getSnapshot());
  }

  /**
   * Stops execution for a specific issue.
   *
   * @param issueId - The ID of the issue to stop
   */
  private async stopIssue(issueId: string): Promise<void> {
    this.logger.info(`Stopping issue: ${issueId}`);
    // Implementation for stopping active runs
  }

  /**
   * Starts the polling loop and the internal HTTP server.
   */
  public start(): void {
    if (this.server) {
      void this.server.start();
    }
    const intervalMs = this.config.polling.intervalMs || 30000;
    this.interval = setInterval(() => {
      void this.tick();
    }, intervalMs);
    void this.tick(); // Initial tick
  }

  /**
   * Stops the orchestrator, clearing the polling interval and stopping the server.
   */
  public async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.server) {
      this.server.stop();
    }
    this.logger.info('Orchestrator stopped.');
  }

  /**
   * Returns a point-in-time snapshot of the orchestrator's internal state.
   */
  public getSnapshot(): Record<string, unknown> {
    return {
      running: Array.from(this.state.running.entries()),
      retryAttempts: Array.from(this.state.retryAttempts.entries()),
      claimed: Array.from(this.state.claimed),
      tokenTotals: this.state.tokenTotals,
      maxConcurrentAgents: this.state.maxConcurrentAgents,
      globalCooldownUntilMs: this.state.globalCooldownUntilMs,
      recentRequestTimestamps: this.state.recentRequestTimestamps,
      recentInputTokens: this.state.recentInputTokens,
      recentOutputTokens: this.state.recentOutputTokens,
      maxRequestsPerMinute: this.state.maxRequestsPerMinute,
      maxRequestsPerSecond: this.state.maxRequestsPerSecond,
      maxInputTokensPerMinute: this.state.maxInputTokensPerMinute,
      maxOutputTokensPerMinute: this.state.maxOutputTokensPerMinute,
    };
  }
}
