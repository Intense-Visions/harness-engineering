import * as http from 'node:http';
import * as net from 'node:net';
import * as path from 'node:path';
import { WebSocketBroadcaster } from './websocket';
import { handleInteractionsRoute } from './routes/interactions';
import { handlePlansRoute } from './routes/plans';
import { handleChatProxyRoute } from './routes/chat-proxy';
import { handleAnalyzeRoute } from './routes/analyze';
import { handleRoadmapActionsRoute } from './routes/roadmap-actions';
import { handleDispatchActionsRoute } from './routes/dispatch-actions';
import type { DispatchAdHocFn } from './routes/dispatch-actions';
import { handleAnalysesRoute } from './routes/analyses';
import { handleMaintenanceRoute } from './routes/maintenance';
import type { MaintenanceRouteDeps } from './routes/maintenance';
import { handleSessionsRoute } from './routes/sessions';
import { handleStreamsRoute } from './routes/streams';
import { handleStaticFile } from './static';
import { PlanWatcher } from './plan-watcher';
import type { InteractionQueue, PendingInteraction } from '../core/interaction-queue';
import type { AnalysisArchive } from '../core/analysis-archive';
import type { StreamRecorder } from '../core/stream-recorder';
import type { IntelligencePipeline } from '@harness-engineering/intelligence';

/* ── In-memory per-IP rate limiter (no external deps) ── */
const RATE_LIMIT = Number(process.env['HARNESS_RATE_LIMIT']) || 100; // requests per window
const WINDOW_MS = 60_000; // 1-minute sliding window
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// Prune expired entries every 60 s to prevent unbounded growth
const ratePruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(ip);
  }
}, 60_000);
ratePruneTimer.unref(); // don't keep process alive

function isLocalhost(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function checkRateLimit(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const ip = (req.socket as net.Socket).remoteAddress ?? 'unknown';
  if (!process.env['HARNESS_RATE_LIMIT_LOCALHOST'] && isLocalhost(ip)) return true;

  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  if (bucket.count > RATE_LIMIT) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) });
    res.end(JSON.stringify({ error: 'Too Many Requests' }));
    return false;
  }
  return true;
}

/**
 * Returns the host address the server should bind to.
 * Defaults to 127.0.0.1 (loopback) unless the HOST env var is set (e.g. 0.0.0.0 for containers).
 *
 * NOTE: Duplicated in packages/dashboard/src/server/serve.ts
 */
export function getBindHost(): string {
  return process.env['HOST'] ?? '127.0.0.1';
}

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
  /** Analysis archive for persisted intelligence results */
  analysisArchive?: AnalysisArchive;
  /** Path to the roadmap markdown file (for append action) */
  roadmapPath?: string | null;
  /** Callback to dispatch a work item immediately, bypassing the tick loop */
  dispatchAdHoc?: DispatchAdHocFn | null;
  /** Directory for chat session metadata (default: <cwd>/.harness/sessions) */
  sessionsDir?: string;
  /** Maintenance scheduler + reporter deps for dashboard routes */
  maintenanceDeps?: MaintenanceRouteDeps | null;
}

export class OrchestratorServer {
  private httpServer: http.Server;
  private broadcaster: WebSocketBroadcaster;
  private orchestrator: Snapshotable;
  private interactionQueue: InteractionQueue | undefined;
  private plansDir!: string;
  private dashboardDir!: string;
  private port: number;
  private claudeCommand!: string;
  private pipeline!: IntelligencePipeline | null;
  private analysisArchive: AnalysisArchive | undefined;
  private roadmapPath!: string | null;
  private dispatchAdHoc!: DispatchAdHocFn | null;
  private sessionsDir!: string;
  private maintenanceDeps: MaintenanceRouteDeps | null = null;
  private recorder: StreamRecorder | null = null;
  private planWatcher: PlanWatcher | null = null;
  private stateChangeListener!: (snapshot: unknown) => void;
  private agentEventListener!: (event: unknown) => void;

  constructor(orchestrator: Snapshotable, port: number, deps?: ServerDependencies) {
    this.orchestrator = orchestrator;
    this.port = port;
    this.initDependencies(deps);
    this.httpServer = http.createServer(this.handleRequest.bind(this));
    this.broadcaster = new WebSocketBroadcaster(this.httpServer, () =>
      this.orchestrator.getSnapshot()
    );
    this.wireEvents();
  }

  private initDependencies(deps?: ServerDependencies): void {
    this.interactionQueue = deps?.interactionQueue;
    this.plansDir = deps?.plansDir ?? path.resolve('docs', 'plans');
    this.dashboardDir =
      deps?.dashboardDir ?? path.resolve('packages', 'dashboard', 'dist', 'client');
    this.claudeCommand = deps?.claudeCommand ?? 'claude';
    this.pipeline = deps?.pipeline ?? null;
    this.analysisArchive = deps?.analysisArchive;
    this.roadmapPath = deps?.roadmapPath ?? null;
    this.dispatchAdHoc = deps?.dispatchAdHoc ?? null;
    this.sessionsDir = deps?.sessionsDir ?? path.resolve('.harness', 'sessions');
    this.maintenanceDeps = deps?.maintenanceDeps ?? null;
  }

  private wireEvents(): void {
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

  /**
   * Broadcast a maintenance event to all WebSocket clients.
   * @param type - One of 'maintenance:started', 'maintenance:completed', 'maintenance:error'
   * @param data - Event payload (task info, run result, or error details)
   */
  public broadcastMaintenance(type: string, data: unknown): void {
    this.broadcaster.broadcast(type, data);
  }

  /**
   * Broadcast a local-model status change to dashboard clients.
   *
   * Phase 3 routes status events through the existing WebSocket broadcaster
   * on topic `local-model:status` so test fixtures and dashboard consumers
   * observe payloads immediately. The project broadcasts via WebSocket; the
   * spec's "SSE topic" wording is approximate. Phase 4 widens the payload
   * for multi-local backends but does not change the channel.
   */
  public broadcastLocalModelStatus(
    status: import('@harness-engineering/types').LocalModelStatus
  ): void {
    this.broadcaster.broadcast('local-model:status', status);
  }

  /**
   * Update the intelligence pipeline reference after construction.
   *
   * The orchestrator constructs the pipeline lazily inside `start()` (the
   * resolver must observe the server before pipeline construction). The
   * server is built in the orchestrator constructor with `pipeline: null`,
   * so it must be told the real pipeline once it's been created — otherwise
   * `/api/analyze` would always see a null pipeline and return 503.
   */
  public setPipeline(pipeline: IntelligencePipeline | null): void {
    this.pipeline = pipeline;
  }

  /**
   * Set (or update) the maintenance route dependencies after construction.
   * Called by the Orchestrator once the scheduler and reporter are ready.
   */
  public setMaintenanceDeps(deps: MaintenanceRouteDeps): void {
    this.maintenanceDeps = deps;
  }

  /**
   * Set the stream recorder for serving recorded session streams.
   */
  public setRecorder(recorder: StreamRecorder): void {
    this.recorder = recorder;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.handleStateEndpoint(req, res)) {
      return;
    }

    // Per-IP rate limiting (state/health-check endpoint is exempt above)
    if (!checkRateLimit(req, res)) {
      return;
    }

    if (this.handleApiRoutes(req, res)) {
      return;
    }

    // Static file serving (must be last -- SPA fallback)
    if (handleStaticFile(req, res, this.dashboardDir)) {
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  /** Handle GET /api/state and legacy /api/v1/state */
  private handleStateEndpoint(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const { method, url } = req;
    if (method === 'GET' && (url === '/api/state' || url === '/api/v1/state')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.orchestrator.getSnapshot()));
      return true;
    }
    return false;
  }

  /**
   * Check bearer token auth for mutating API routes.
   * When HARNESS_API_TOKEN is set, all API requests must include it.
   * Read-only endpoints (state, static) are exempt.
   */
  private checkAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const token = process.env['HARNESS_API_TOKEN'];
    if (!token) return true; // Auth not configured — allow (localhost-only)

    const authHeader = req.headers['authorization'];
    if (authHeader === `Bearer ${token}`) return true;

    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: 'Unauthorized — set Authorization: Bearer <HARNESS_API_TOKEN>' })
    );
    return false;
  }

  /** Dispatch to API route handlers. Returns true if a route matched. */
  private handleApiRoutes(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    if (!this.checkAuth(req, res)) return true;
    // Interactions routes
    if (this.interactionQueue && handleInteractionsRoute(req, res, this.interactionQueue)) {
      return true;
    }

    // Plans route
    if (handlePlansRoute(req, res, this.plansDir)) {
      return true;
    }

    // Analyze route (intelligence pipeline)
    if (handleAnalyzeRoute(req, res, this.pipeline)) {
      return true;
    }

    // Analyses archive route
    if (handleAnalysesRoute(req, res, this.analysisArchive)) {
      return true;
    }

    // Roadmap append route
    if (handleRoadmapActionsRoute(req, res, this.roadmapPath)) {
      return true;
    }

    // Ad-hoc dispatch route
    if (handleDispatchActionsRoute(req, res, this.dispatchAdHoc)) {
      return true;
    }

    // Maintenance dashboard routes
    if (handleMaintenanceRoute(req, res, this.maintenanceDeps)) {
      return true;
    }

    // Stream recording route
    if (this.recorder && handleStreamsRoute(req, res, this.recorder)) {
      return true;
    }

    // Chat session metadata route
    if (handleSessionsRoute(req, res, this.sessionsDir)) {
      return true;
    }

    // Chat proxy route (spawns Claude Code CLI — no API key required)
    if (handleChatProxyRoute(req, res, this.claudeCommand)) {
      return true;
    }

    return false;
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
      const host = getBindHost();
      this.httpServer.listen(this.port, host, () => {
        console.log(`Orchestrator API listening on ${host}:${this.port}`);
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
