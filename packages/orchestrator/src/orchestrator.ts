import { EventEmitter } from 'node:events';
import {
  WorkflowConfig,
  Issue,
  IssueTrackerClient,
  AgentBackend,
} from '@harness-engineering/types';
import { OrchestratorState, OrchestratorEvent, applyEvent, createEmptyState } from './core/index';
import { RoadmapTrackerAdapter } from './tracker/adapters/roadmap';
import { WorkspaceManager } from './workspace/manager';
import { WorkspaceHooks } from './workspace/hooks';
import { AgentRunner } from './agent/runner';
import { PromptRenderer } from './prompt/renderer';
import { MockBackend } from './agent/backends/mock';
import { ClaudeBackend } from './agent/backends/claude';
import { OrchestratorServer } from './server/http';

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

  constructor(config: WorkflowConfig, promptTemplate: string) {
    super();
    this.config = config;
    this.promptTemplate = promptTemplate;
    this.state = createEmptyState(config);

    // Initialize adapters based on config
    this.tracker = this.createTracker();
    this.workspace = new WorkspaceManager(config.workspace);
    this.hooks = new WorkspaceHooks(config.hooks);
    this.renderer = new PromptRenderer();
    this.runner = new AgentRunner(this.createBackend(), {
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
    }
    throw new Error(`Unsupported agent backend: ${this.config.agent.backend}`);
  }

  /**
   * Run a single tick of the orchestrator loop.
   */
  public async tick(): Promise<void> {
    // 1. Fetch candidates from tracker
    const candidatesResult = await this.tracker.fetchCandidateIssues();
    if (!candidatesResult.ok) {
      console.error('Failed to fetch candidate issues:', candidatesResult.error);
      return;
    }

    // 2. Fetch current status for running issues
    const runningIds = Array.from(this.state.running.keys());
    const runningStatesResult = await this.tracker.fetchIssueStatesByIds(runningIds);
    if (!runningStatesResult.ok) {
      console.error('Failed to fetch running issue states:', runningStatesResult.error);
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

  private async handleEffect(effect: any): Promise<void> {
    switch (effect.type) {
      case 'dispatch':
        await this.dispatchIssue(effect.issue, effect.attempt);
        break;
      case 'stop':
        await this.stopIssue(effect.issueId);
        break;
      // Handle other effects...
    }
  }

  private async dispatchIssue(issue: Issue, attempt: number | null): Promise<void> {
    console.log(`Dispatching issue: ${issue.identifier} (attempt ${attempt})`);

    try {
      // 1. Ensure workspace
      const workspaceResult = await this.workspace.ensureWorkspace(issue.identifier);
      if (!workspaceResult.ok) throw workspaceResult.error;
      const workspacePath = workspaceResult.value;

      // 2. Run hooks
      const hookResult = await this.hooks.beforeRun(workspacePath);
      if (!hookResult.ok) throw hookResult.error;

      // 3. Render prompt
      const prompt = await this.renderer.render(this.promptTemplate, {
        issue,
        attempt: attempt || 1,
      });

      // 4. Start agent session (in background)
      this.runAgentInBackgroundTask(issue, workspacePath, prompt, attempt);
    } catch (error) {
      console.error(`Dispatch failed for ${issue.identifier}:`, error);
      this.emitWorkerExit(issue.id, 'error', attempt, String(error));
    }
  }

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
          // Normal events (thought, status, etc.) can be logged or emitted to state
          // this.handleAgentEvent(issue.id, event);
          this.emit('agent_event', { issueId: issue.id, event });
        }
        // When finished, emit success to state machine
        this.emitWorkerExit(issue.id, 'normal', attempt);
      } catch (error) {
        console.error(`Agent runner failed for ${issue.identifier}:`, error);
        this.emitWorkerExit(issue.id, 'error', attempt, String(error));
      }
    })();
  }

  private emitWorkerExit(
    issueId: string,
    reason: 'normal' | 'error',
    attempt: number | null,
    error?: string
  ): void {
    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId,
      reason,
      error,
      attempt,
    };
    const { nextState, effects } = applyEvent(this.state, event, this.config);
    this.state = nextState;
    // Process side effects immediately
    for (const effect of effects) {
      this.handleEffect(effect);
    }
    this.emit('state_change', this.getSnapshot());
  }

  private async stopIssue(issueId: string): Promise<void> {
    console.log(`Stopping issue: ${issueId}`);
    // Implementation for stopping active runs
  }

  /**
   * Starts the polling loop.
   */
  public start(): void {
    if (this.server) {
      this.server.start();
    }
    const interval = this.config.polling.intervalMs || 30000;
    setInterval(() => this.tick(), interval);
    this.tick(); // Initial tick
  }

  public getSnapshot(): any {
    return {
      running: Array.from(this.state.running.entries()),
      retryAttempts: Array.from(this.state.retryAttempts.entries()),
      claimed: Array.from(this.state.claimed),
      tokenTotals: this.state.tokenTotals,
      maxConcurrentAgents: this.state.maxConcurrentAgents,
    };
  }
}
