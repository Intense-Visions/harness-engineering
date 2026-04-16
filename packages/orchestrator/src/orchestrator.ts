import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  WorkflowConfig,
  Issue,
  IssueTrackerClient,
  AgentBackend,
  ConcernSignal,
} from '@harness-engineering/types';
import { writeTaint } from '@harness-engineering/core';
import {
  IntelligencePipeline,
  AnthropicAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
  ClaudeCliAnalysisProvider,
} from '@harness-engineering/intelligence';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import type {
  EnrichedSpec,
  SimulationResult,
  ComplexityScore,
  ExecutionOutcome,
} from '@harness-engineering/intelligence';
import { GraphStore } from '@harness-engineering/graph';
import type { OrchestratorState, LiveSession } from './types/internal';
import {
  OrchestratorEvent,
  SideEffect,
  applyEvent,
  createEmptyState,
  detectScopeTier,
  artifactPresenceFromIssue,
  resolveEscalationConfig,
  AnalysisArchive,
  renderAnalysisComment,
  loadPublishedIndex,
  savePublishedIndex,
} from './core/index';
import type { AnalysisRecord } from './core/index';
import {
  GitHubIssuesSyncAdapter,
  loadTrackerSyncConfig,
  type TrackerSyncAdapter,
} from '@harness-engineering/core';
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
import { PiBackend } from './agent/backends/pi';
import { OrchestratorServer } from './server/http';
import { StructuredLogger } from './logging/logger';
import { scanWorkspaceConfig } from './workspace/config-scanner';
import { InteractionQueue } from './core/interaction-queue';
import { computeRateLimitDelay } from './core/rate-limiter';
import type { EscalateEffect } from './types/events';

const CONNECTION_ERROR_PATTERNS = [
  'Connection error',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'fetch failed',
];

function isConnectionError(err: unknown): boolean {
  const msg = String(err);
  return CONNECTION_ERROR_PATTERNS.some((p) => msg.includes(p));
}

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
  private pipeline: IntelligencePipeline | null;
  private analysisArchive: AnalysisArchive;
  private graphStore: GraphStore | null = null;

  /** Project root directory, derived from workspace root. */
  private get projectRoot(): string {
    return path.resolve(this.config.workspace.root, '..', '..');
  }
  private graphLoaded = false;
  private enrichedSpecsByIssue: Map<string, EnrichedSpec> = new Map();
  /** Tracks recently-failed intelligence analysis to avoid re-requesting every tick */
  private analysisFailureCache: Map<string, number> = new Map();
  /** Guards against overlapping ticks when a tick takes longer than the polling interval */
  private tickInProgress = false;
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

    this.analysisArchive = new AnalysisArchive(path.join(config.workspace.root, '..', 'analyses'));

    const localBackend = this.createLocalBackend();
    this.localRunner = localBackend
      ? new AgentRunner(localBackend, { maxTurns: config.agent.maxTurns })
      : null;

    this.pipeline = this.createIntelligencePipeline();

    if (config.server?.port) {
      this.server = new OrchestratorServer(this, config.server.port, {
        interactionQueue: this.interactionQueue,
        plansDir: path.resolve(config.workspace.root, '..', 'docs', 'plans'),
        pipeline: this.pipeline,
        analysisArchive: this.analysisArchive,
        roadmapPath: config.tracker.filePath ?? null,
        dispatchAdHoc: this.dispatchAdHoc.bind(this),
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
      if (this.config.agent.localTimeoutMs)
        localConfig.timeoutMs = this.config.agent.localTimeoutMs;
      return new LocalBackend(localConfig);
    }
    if (this.config.agent.localBackend === 'pi') {
      return new PiBackend({
        model: this.config.agent.localModel,
        endpoint: this.config.agent.localEndpoint,
        apiKey: this.config.agent.localApiKey,
      });
    }
    return null;
  }

  private createIntelligencePipeline(): IntelligencePipeline | null {
    const intel = this.config.intelligence;
    if (!intel?.enabled) return null;

    const provider = this.createAnalysisProvider();
    if (!provider) return null;

    const peslModel = intel.models?.pesl ?? this.config.agent.model;
    const store = new GraphStore();
    this.graphStore = store;
    return new IntelligencePipeline(provider, store, {
      ...(peslModel !== undefined && { peslModel }),
    });
  }

  /**
   * Create the AnalysisProvider for the intelligence pipeline.
   *
   * Resolution order:
   * 1. Explicit `intelligence.provider` config (separate key/endpoint)
   * 2. Local backend config (agent.localBackend + localEndpoint/localModel)
   * 3. Primary agent backend config (agent.apiKey + agent.backend)
   */
  private createAnalysisProvider(): AnalysisProvider | null {
    const intel = this.config.intelligence;
    const selModel = intel?.models?.sel ?? this.config.agent.model;

    // 1. Explicit intelligence provider override
    if (intel?.provider) {
      return this.createProviderFromExplicitConfig(intel.provider, selModel);
    }

    // 2. Local backend (OpenAI-compatible endpoint like Ollama / LM Studio)
    if (
      this.config.agent.localBackend === 'openai-compatible' ||
      this.config.agent.localBackend === 'pi'
    ) {
      const endpoint = this.config.agent.localEndpoint ?? 'http://localhost:11434/v1';
      const apiKey = this.config.agent.localApiKey ?? 'ollama';
      const model = selModel ?? this.config.agent.localModel;
      this.logger.info(`Intelligence pipeline using local backend at ${endpoint}`);
      return new OpenAICompatibleAnalysisProvider({
        apiKey,
        baseUrl: endpoint,
        ...(model !== undefined && { defaultModel: model }),
        ...(intel?.requestTimeoutMs !== undefined && { timeoutMs: intel.requestTimeoutMs }),
        ...(intel?.promptSuffix !== undefined && { promptSuffix: intel.promptSuffix }),
        ...(intel?.jsonMode !== undefined && { jsonMode: intel.jsonMode }),
      });
    }

    // 3. Primary agent backend (API key)
    const backend = this.config.agent.backend;
    if (backend === 'anthropic' || backend === 'claude') {
      const apiKey = this.config.agent.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        return new AnthropicAnalysisProvider({
          apiKey,
          ...(selModel !== undefined && { defaultModel: selModel }),
        });
      }
      // No API key — fall through to Claude CLI fallback
    }

    if (backend === 'openai') {
      const apiKey = this.config.agent.apiKey ?? process.env.OPENAI_API_KEY;
      if (apiKey) {
        return new OpenAICompatibleAnalysisProvider({
          apiKey,
          baseUrl: 'https://api.openai.com/v1',
          ...(selModel !== undefined && { defaultModel: selModel }),
        });
      }
    }

    // 4. Claude CLI fallback — uses the CLI's own auth, no API key needed
    if (backend === 'claude' || backend === 'anthropic') {
      this.logger.info('Intelligence pipeline using Claude CLI (no API key configured)');
      return new ClaudeCliAnalysisProvider({
        command: this.config.agent.command,
        ...(selModel !== undefined && { defaultModel: selModel }),
        ...(intel?.requestTimeoutMs !== undefined && { timeoutMs: intel.requestTimeoutMs }),
      });
    }

    this.logger.warn(
      `Intelligence pipeline: unsupported backend "${backend}". ` +
        'Supported: anthropic, claude, openai, or localBackend: openai-compatible / pi.'
    );
    return null;
  }

  private createProviderFromExplicitConfig(
    provider: NonNullable<NonNullable<typeof this.config.intelligence>['provider']>,
    selModel: string | undefined
  ): AnalysisProvider {
    if (provider.kind === 'anthropic') {
      const apiKey = provider.apiKey ?? this.config.agent.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('Intelligence pipeline: no Anthropic API key found.');
      }
      return new AnthropicAnalysisProvider({
        apiKey,
        ...(selModel !== undefined && { defaultModel: selModel }),
      });
    }

    if (provider.kind === 'claude-cli') {
      return new ClaudeCliAnalysisProvider({
        command: this.config.agent.command,
        ...(selModel !== undefined && { defaultModel: selModel }),
        ...(this.config.intelligence?.requestTimeoutMs !== undefined && {
          timeoutMs: this.config.intelligence.requestTimeoutMs,
        }),
      });
    }

    // openai-compatible
    const apiKey = provider.apiKey ?? this.config.agent.apiKey ?? 'ollama';
    const baseUrl = provider.baseUrl ?? 'http://localhost:11434/v1';
    const intel = this.config.intelligence;
    return new OpenAICompatibleAnalysisProvider({
      apiKey,
      baseUrl,
      ...(selModel !== undefined && { defaultModel: selModel }),
      ...(intel?.requestTimeoutMs !== undefined && { timeoutMs: intel.requestTimeoutMs }),
      ...(intel?.promptSuffix !== undefined && { promptSuffix: intel.promptSuffix }),
      ...(intel?.jsonMode !== undefined && { jsonMode: intel.jsonMode }),
    });
  }

  private async runPeslSimulations(
    candidates: Issue[],
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>
  ): Promise<Map<string, SimulationResult>> {
    if (!this.pipeline) return new Map();
    const results = new Map<string, SimulationResult>();
    for (const issue of candidates) {
      const spec = enrichedSpecs.get(issue.id);
      const score = complexityScores.get(issue.id);
      if (!spec || !score) continue;

      const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
      try {
        const simResult = await this.pipeline.simulate(spec, score, scopeTier);
        results.set(issue.id, simResult);
      } catch (err) {
        this.logger.error(`PESL simulation failed for ${issue.identifier}`, {
          issueId: issue.id,
          error: String(err),
        });
        // Simulation failure is non-fatal — issue proceeds without simulation
      }
    }
    return results;
  }

  private async archiveAnalysisResults(
    candidates: Issue[],
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>,
    simulationResults: Map<string, SimulationResult>
  ): Promise<void> {
    for (const issue of candidates) {
      const spec = enrichedSpecs.get(issue.id) ?? null;
      const score = complexityScores.get(issue.id) ?? null;
      const simulation = simulationResults.get(issue.id) ?? null;
      if (!spec && !score && !simulation) continue;
      try {
        await this.analysisArchive.save({
          issueId: issue.id,
          identifier: issue.identifier,
          spec,
          score,
          simulation,
          analyzedAt: new Date().toISOString(),
          externalId: issue.externalId ?? null,
        });
      } catch (err) {
        this.logger.warn(`Failed to archive analysis for ${issue.identifier}`, {
          issueId: issue.id,
          error: String(err),
        });
      }
    }
  }

  /**
   * Auto-publish analysis results to the external tracker as structured comments.
   * Fires only when:
   * - A tracker is configured in harness.config.json (roadmap.tracker)
   * - GITHUB_TOKEN env var is available
   * - The record has a non-null externalId
   * - The record has not already been published (per the published index)
   *
   * Errors are non-fatal: a failed publish logs a warning but does not block
   * the orchestrator tick.
   */
  private async autoPublishAnalyses(
    candidates: Issue[],
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>,
    simulationResults: Map<string, SimulationResult>
  ): Promise<void> {
    const trackerConfig = loadTrackerSyncConfig(this.projectRoot);
    if (!trackerConfig) return;

    const token = process.env.GITHUB_TOKEN;
    if (!token) return;

    let adapter: TrackerSyncAdapter;
    try {
      adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
    } catch (err) {
      this.logger.warn('Failed to create tracker adapter for auto-publish', {
        error: String(err),
      });
      return;
    }

    const publishedIndex = loadPublishedIndex(this.projectRoot);
    let publishedCount = 0;

    for (const issue of candidates) {
      const spec = enrichedSpecs.get(issue.id) ?? null;
      const score = complexityScores.get(issue.id) ?? null;
      const simulation = simulationResults.get(issue.id) ?? null;
      if (!spec && !score && !simulation) continue;

      const externalId = issue.externalId ?? null;
      if (!externalId) continue;
      if (publishedIndex[issue.id]) continue;

      const record: AnalysisRecord = {
        issueId: issue.id,
        identifier: issue.identifier,
        spec,
        score,
        simulation,
        analyzedAt: new Date().toISOString(),
        externalId,
      };

      try {
        const commentBody = renderAnalysisComment(record);
        const result = await adapter.addComment(externalId, commentBody);

        if (result.ok) {
          publishedIndex[issue.id] = new Date().toISOString();
          publishedCount++;
          this.logger.info(`Auto-published analysis for ${issue.identifier} to ${externalId}`);
        } else {
          this.logger.warn(`Auto-publish failed for ${issue.identifier}: ${result.error.message}`, {
            issueId: issue.id,
          });
        }
      } catch (err) {
        this.logger.warn(`Auto-publish error for ${issue.identifier}`, {
          issueId: issue.id,
          error: String(err),
        });
      }
    }

    if (publishedCount > 0) {
      try {
        savePublishedIndex(this.projectRoot, publishedIndex);
      } catch (err) {
        this.logger.warn('Failed to persist published index after auto-publish', {
          error: String(err),
        });
      }
    }
  }

  private async runIntelligencePipeline(candidates: Issue[]): Promise<{
    concernSignals: Map<string, ConcernSignal[]>;
    enrichedSpecs: Map<string, EnrichedSpec>;
    complexityScores: Map<string, ComplexityScore>;
    simulationResults: Map<string, SimulationResult>;
  }> {
    const concernSignals = new Map<string, ConcernSignal[]>();
    const enrichedSpecs = new Map<string, EnrichedSpec>();
    const complexityScores = new Map<string, ComplexityScore>();

    // Seed with previously-cached specs so routing still has enrichment context
    for (const [id, spec] of this.enrichedSpecsByIssue) {
      enrichedSpecs.set(id, spec);
    }
    const escalationConfig = resolveEscalationConfig(this.config);
    const failureTtl = this.config.intelligence?.failureCacheTtlMs ?? 300_000;
    const nowForCache = Date.now();

    // Evict expired failure cache entries
    for (const [id, failedAt] of this.analysisFailureCache) {
      if (nowForCache - failedAt >= failureTtl) {
        this.analysisFailureCache.delete(id);
      }
    }

    const eligibleCandidates = candidates.filter((issue) => {
      const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
      if (escalationConfig.autoExecute.includes(scopeTier)) return false;
      if (this.analysisFailureCache.has(issue.id)) return false;
      // Skip issues already successfully analyzed (cache cleared on completion)
      if (this.enrichedSpecsByIssue.has(issue.id)) return false;
      return true;
    });

    const circuitBreakerThreshold = this.config.intelligence?.circuitBreakerThreshold ?? 2;
    let consecutiveConnectionErrors = 0;

    let processed = 0;
    for (const issue of eligibleCandidates) {
      processed++;
      this.setTickActivity('analyzing', `SEL/CML: ${issue.identifier} — ${issue.title}`, {
        current: processed,
        total: eligibleCandidates.length,
      });

      const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
      try {
        const result = await this.pipeline!.preprocessIssue(issue, scopeTier, escalationConfig);
        if (result.signals.length > 0) concernSignals.set(issue.id, result.signals);
        if (result.spec) {
          enrichedSpecs.set(issue.id, result.spec);
          this.enrichedSpecsByIssue.set(issue.id, result.spec);
        }
        if (result.score) complexityScores.set(issue.id, result.score);
        consecutiveConnectionErrors = 0;
      } catch (err) {
        this.analysisFailureCache.set(issue.id, nowForCache);

        if (isConnectionError(err)) {
          consecutiveConnectionErrors++;
          if (consecutiveConnectionErrors >= circuitBreakerThreshold) {
            const remaining = eligibleCandidates.slice(processed);
            for (const skipped of remaining) {
              this.analysisFailureCache.set(skipped.id, nowForCache);
            }
            this.logger.warn(
              `Intelligence pipeline unreachable, skipping remaining ${remaining.length} issues (${consecutiveConnectionErrors} consecutive connection errors)`,
              { error: String(err), cachedForMs: failureTtl }
            );
            break;
          }
        }

        this.logger.error(
          `Intelligence pipeline failed for ${issue.identifier}, cached for ${failureTtl}ms`,
          { issueId: issue.id, error: String(err) }
        );
      }
    }

    this.setTickActivity('analyzing', 'PESL: Running simulations');
    const simulationResults = await this.runPeslSimulations(
      candidates,
      enrichedSpecs,
      complexityScores
    );

    this.setTickActivity('analyzing', 'Archiving analysis results');
    await this.archiveAnalysisResults(
      candidates,
      enrichedSpecs,
      complexityScores,
      simulationResults
    );

    // Auto-publish to external tracker (non-fatal)
    try {
      this.setTickActivity('analyzing', 'Publishing to tracker');
      await this.autoPublishAnalyses(
        candidates,
        enrichedSpecs,
        complexityScores,
        simulationResults
      );
    } catch (err) {
      this.logger.warn('Auto-publish analyses failed', { error: String(err) });
    }

    return { concernSignals, enrichedSpecs, complexityScores, simulationResults };
  }

  public async asyncTick(): Promise<void> {
    // Load persisted data on first tick (can't await in constructor)
    if (this.pipeline && this.graphStore && !this.graphLoaded) {
      this.graphLoaded = true;
      try {
        const graphDir = path.join(this.config.workspace.root, '..', 'graph');
        const loaded = await this.graphStore.load(graphDir);
        if (loaded) {
          this.logger.info('Graph store loaded from disk');
        } else {
          this.logger.info('No persisted graph data found, starting with empty graph');
        }
      } catch (err) {
        // Graph load failure is non-fatal — empty graph is a valid fallback
        this.logger.warn('Failed to load graph store, starting with empty graph', {
          error: String(err),
        });
      }

      // Hydrate enriched spec cache from analysis archive
      try {
        const archived = await this.analysisArchive.list();
        for (const record of archived) {
          if (record.spec && !this.enrichedSpecsByIssue.has(record.issueId)) {
            this.enrichedSpecsByIssue.set(record.issueId, record.spec);
          }
        }
        if (archived.length > 0) {
          this.logger.info(`Loaded ${this.enrichedSpecsByIssue.size} cached analyses from archive`);
        }
      } catch (err) {
        this.logger.warn('Failed to load analysis archive, will re-analyze on demand', {
          error: String(err),
        });
      }
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
      ? await this.runIntelligencePipeline(candidatesResult.value)
      : undefined;
    this.setTickActivity('dispatching', 'Applying state machine');
    const { concernSignals, enrichedSpecs, complexityScores, simulationResults } =
      pipelineResult ?? {};

    // 4. Dispatch tick event to state machine
    const tickEvent: OrchestratorEvent = {
      type: 'tick' as const,
      candidates: candidatesResult.value,
      runningStates: runningStatesResult.value,
      nowMs,
      ...(concernSignals !== undefined && { concernSignals }),
      ...(enrichedSpecs !== undefined && { enrichedSpecs }),
      ...(complexityScores !== undefined && { complexityScores }),
      ...(simulationResults !== undefined && { simulationResults }),
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
        candidates: candidatesResult.value,
        nowMs,
      };
      const result = applyEvent(this.state, retryEvent, this.config);
      this.state = result.nextState;
      effects.push(...result.effects);
    }

    // 5. Handle effects
    for (const effect of effects) {
      await this.handleEffect(effect);
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
              const waitTime = computeRateLimitDelay(this.state, this.state);
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
    // Record execution outcome in graph (if pipeline is enabled)
    if (this.pipeline) {
      const entry = this.state.running.get(issueId);
      const enrichedSpec = this.enrichedSpecsByIssue.get(issueId);
      const affectedSystemNodeIds = enrichedSpec
        ? enrichedSpec.affectedSystems
            .filter((s) => s.graphNodeId !== null)
            .map((s) => s.graphNodeId!)
        : [];

      const outcome: ExecutionOutcome = {
        id: `outcome:${issueId}:${attempt ?? 0}`,
        issueId,
        identifier: entry?.identifier ?? issueId,
        result: reason === 'normal' ? 'success' : 'failure',
        retryCount: attempt ?? 0,
        failureReasons: error ? [error] : [],
        durationMs: entry ? Date.now() - new Date(entry.startedAt).getTime() : 0,
        linkedSpecId: enrichedSpec?.id ?? null,
        affectedSystemNodeIds,
        timestamp: new Date().toISOString(),
      };

      try {
        this.pipeline.recordOutcome(outcome);
        this.logger.info(`Recorded execution outcome for ${issueId}: ${reason}`, {
          issueId,
          result: outcome.result,
        });

        // Persist graph to disk so historical complexity data survives restarts
        if (this.graphStore) {
          const graphDir = path.join(this.config.workspace.root, '..', 'graph');
          await this.graphStore.save(graphDir);
        }
      } catch (err) {
        this.logger.warn(`Failed to record execution outcome for ${issueId}`, {
          error: String(err),
        });
      }

      // Clean up enriched spec cache for completed issues
      if (reason === 'normal') {
        this.enrichedSpecsByIssue.delete(issueId);
      }
    }

    // Persist completion to the tracker so the issue is no longer a candidate
    // on subsequent ticks — including across orchestrator restarts. Failures
    // are logged but do not block: the in-memory `completed` set still
    // prevents re-dispatch within this process.
    if (reason === 'normal') {
      try {
        const result = await this.tracker.markIssueComplete(issueId);
        if (!result.ok) {
          this.logger.warn(`Tracker write-back failed for ${issueId}: ${String(result.error)}`, {
            issueId,
          });
        }
      } catch (err) {
        this.logger.warn(`Tracker write-back threw for ${issueId}`, {
          issueId,
          error: String(err),
        });
      }
    }

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
      completed: new Set(this.state.completed),
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
    return {
      running: Array.from(this.state.running.entries()),
      retryAttempts: Array.from(this.state.retryAttempts.entries()),
      claimed: Array.from(this.state.claimed),
      completed: Array.from(this.state.completed),
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
      tickActivity: this.tickActivity,
    };
  }
}
