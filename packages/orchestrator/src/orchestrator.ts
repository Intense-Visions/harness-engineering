import { EventEmitter } from 'node:events';
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
import { OrchestratorServer } from './server/http';
import { StructuredLogger } from './logging/logger';
import { scanWorkspaceConfig } from './workspace/config-scanner';

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

    if (config.server?.port) {
      this.server = new OrchestratorServer(this, config.server.port);
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
    }
    throw new Error(`Unsupported agent backend: ${this.config.agent.backend}`);
  }

  /**
   * Run a single tick of the orchestrator loop.
   *
   * This method fetches the latest issue states, applies them to the state machine,
   * and executes any resulting side effects (dispatching new agents, stopping agents, etc.).
   */
  public async tick(): Promise<void> {
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
      nowMs: Date.now(),
    };

    const { nextState, effects } = applyEvent(this.state, tickEvent, this.config);
    this.state = nextState;

    // 4. Handle effects
    for (const effect of effects) {
      await this.handleEffect(effect);
    }

    this.emit('state_change', this.getSnapshot());
  }

  /**
   * Processes a side effect generated by the state machine.
   *
   * @param effect - The effect to handle
   */
  private async handleEffect(effect: SideEffect): Promise<void> {
    switch (effect.type) {
      case 'dispatch':
        await this.dispatchIssue(effect.issue, effect.attempt);
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
    }
  }

  /**
   * Dispatches a new agent to work on an issue.
   *
   * @param issue - The issue to resolve
   * @param attempt - The retry attempt number
   */
  private async dispatchIssue(issue: Issue, attempt: number | null): Promise<void> {
    this.logger.info(`Dispatching issue: ${issue.identifier} (attempt ${attempt})`, {
      issueId: issue.id,
    });

    try {
      // 1. Ensure workspace
      const workspaceResult = await this.workspace.ensureWorkspace(issue.identifier);
      if (!workspaceResult.ok) throw workspaceResult.error;
      const workspacePath = workspaceResult.value;

      // 2. Scan workspace config files for injection patterns
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

      // 3. Run hooks
      const hookResult = await this.hooks.beforeRun(workspacePath);
      if (!hookResult.ok) throw hookResult.error;

      // 4. Render prompt
      const prompt = await this.renderer.render(this.promptTemplate, {
        issue,
        attempt: attempt || 1,
      });

      // 5. Start agent session (in background)
      this.runAgentInBackgroundTask(issue, workspacePath, prompt, attempt);
    } catch (error) {
      this.logger.error(`Dispatch failed for ${issue.identifier}`, { error: String(error) });
      await this.emitWorkerExit(issue.id, 'error', attempt, String(error));
    }
  }

  /**
   * Runs an agent session in a background task to avoid blocking the main loop.
   */
  private runAgentInBackgroundTask(
    issue: Issue,
    workspacePath: string,
    prompt: string,
    attempt: number | null
  ): void {
    (async () => {
      try {
        const sessionGen = this.runner.runSession(issue, workspacePath, prompt);
        for await (const event of sessionGen) {
          // Emit event for TUI/Observability
          this.emit('agent_event', { issueId: issue.id, event });
        }
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
    };
  }
}
