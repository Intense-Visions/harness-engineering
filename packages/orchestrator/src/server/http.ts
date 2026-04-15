import * as http from 'node:http';
import * as path from 'node:path';
import { WebSocketBroadcaster } from './websocket';
import { handleInteractionsRoute } from './routes/interactions';
import { handlePlansRoute } from './routes/plans';
import { handleChatProxyRoute } from './routes/chat-proxy';
import { handleAnalyzeRoute } from './routes/analyze';
import { handleStaticFile } from './static';
import { PlanWatcher } from './plan-watcher';
import type { InteractionQueue, PendingInteraction } from '../core/interaction-queue';
import type { IntelligencePipeline } from '@harness-engineering/intelligence';

export interface Snapshotable {
  getSnapshot(): Record<string, unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface ServerDependencies {
  interactionQueue?: InteractionQueue;
  plansDir?: string;
  dashboardDir?: string;
  /** Claude CLI command name (default: 'claude') */
  claudeCommand?: string;
  /** Intelligence pipeline instance (null if disabled) */
  pipeline?: IntelligencePipeline | null;
}

export class OrchestratorServer {
  private httpServer: http.Server;
  private broadcaster: WebSocketBroadcaster;
  private orchestrator: Snapshotable;
  private interactionQueue: InteractionQueue | undefined;
  private plansDir: string;
  private dashboardDir: string;
  private port: number;
  private claudeCommand: string;
  private pipeline: IntelligencePipeline | null;
  private planWatcher: PlanWatcher | null = null;
  private stateChangeListener: (snapshot: unknown) => void;
  private agentEventListener: (event: unknown) => void;

  constructor(orchestrator: Snapshotable, port: number, deps?: ServerDependencies) {
    this.orchestrator = orchestrator;
    this.port = port;
    this.interactionQueue = deps?.interactionQueue;
    this.plansDir = deps?.plansDir ?? path.resolve('docs', 'plans');
    this.dashboardDir =
      deps?.dashboardDir ?? path.resolve('packages', 'dashboard', 'dist', 'client');
    this.claudeCommand = deps?.claudeCommand ?? 'claude';
    this.pipeline = deps?.pipeline ?? null;
    this.httpServer = http.createServer(this.handleRequest.bind(this));
    this.broadcaster = new WebSocketBroadcaster(this.httpServer);

    // Wire orchestrator events to WebSocket broadcasts (store refs for cleanup)
    this.stateChangeListener = (snapshot: unknown) => {
      this.broadcaster.broadcast('state_change', snapshot);
    };
    this.agentEventListener = (event: unknown) => {
      this.broadcaster.broadcast('agent_event', event);
    };
    this.orchestrator.on('state_change', this.stateChangeListener);
    this.orchestrator.on('agent_event', this.agentEventListener);
  }

  /**
   * Broadcast a new interaction to all WebSocket clients.
   * Called by the orchestrator when a new interaction is pushed.
   */
  public broadcastInteraction(interaction: PendingInteraction): void {
    this.broadcaster.broadcast('interaction_new', interaction);
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const { method, url } = req;

    // State endpoint (supports both /api/state and legacy /api/v1/state)
    if (method === 'GET' && (url === '/api/state' || url === '/api/v1/state')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.orchestrator.getSnapshot()));
      return;
    }

    // Interactions routes
    if (this.interactionQueue && handleInteractionsRoute(req, res, this.interactionQueue)) {
      return;
    }

    // Plans route
    if (handlePlansRoute(req, res, this.plansDir)) {
      return;
    }

    // Analyze route (intelligence pipeline)
    if (handleAnalyzeRoute(req, res, this.pipeline)) {
      return;
    }

    // Chat proxy route (spawns Claude Code CLI — no API key required)
    if (handleChatProxyRoute(req, res, this.claudeCommand)) {
      return;
    }

    // Static file serving (must be last -- SPA fallback)
    if (handleStaticFile(req, res, this.dashboardDir)) {
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  public get wsClientCount(): number {
    return this.broadcaster.clientCount;
  }

  public async start(): Promise<void> {
    // Start plan watcher if interaction queue is available
    if (this.interactionQueue) {
      this.planWatcher = new PlanWatcher(this.plansDir, this.interactionQueue);
      this.planWatcher.start();
    }

    return new Promise((resolve) => {
      this.httpServer.listen(this.port, '127.0.0.1', () => {
        console.log(`Orchestrator API listening on localhost:${this.port}`);
        resolve();
      });
    });
  }

  public stop(): void {
    this.orchestrator.removeListener('state_change', this.stateChangeListener);
    this.orchestrator.removeListener('agent_event', this.agentEventListener);
    if (this.planWatcher) {
      this.planWatcher.stop();
      this.planWatcher = null;
    }
    this.broadcaster.close();
    this.httpServer.close();
  }
}
