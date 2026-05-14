import * as http from 'node:http';
import * as net from 'node:net';
import * as path from 'node:path';
import type { EventEmitter } from 'node:events';
import { assertPortUsable } from '@harness-engineering/core';
import { WebSocketBroadcaster } from './websocket';
import { handleInteractionsRoute } from './routes/interactions';
import { handleV1InteractionsResolveRoute } from './routes/v1/interactions-resolve';
import { handlePlansRoute } from './routes/plans';
import { handleChatProxyRoute } from './routes/chat-proxy';
import { handleAnalyzeRoute } from './routes/analyze';
import { handleRoadmapActionsRoute } from './routes/roadmap-actions';
import { handleDispatchActionsRoute } from './routes/dispatch-actions';
import type { DispatchAdHocFn } from './routes/dispatch-actions';
import { handleAnalysesRoute } from './routes/analyses';
import { handleMaintenanceRoute } from './routes/maintenance';
import type { MaintenanceRouteDeps } from './routes/maintenance';
import { handleV1JobsMaintenanceRoute } from './routes/v1/jobs-maintenance';
import { handleV1EventsSseRoute } from './routes/v1/events-sse';
import { handleSessionsRoute } from './routes/sessions';
import { handleStreamsRoute } from './routes/streams';
import { handleAuthRoute } from './routes/auth';
import { handleLocalModelRoute, handleLocalModelsRoute } from './routes/local-model';
import type { GetLocalModelStatusFn, GetLocalModelStatusesFn } from './routes/local-model';
import { handleStaticFile } from './static';
import { PlanWatcher } from './plan-watcher';
import type { InteractionQueue, PendingInteraction } from '../core/interaction-queue';
import type { AnalysisArchive } from '../core/analysis-archive';
import type { StreamRecorder } from '../core/stream-recorder';
import type { IntelligencePipeline } from '@harness-engineering/intelligence';
import { TokenStore } from '../auth/tokens';
import { AuditLogger } from '../auth/audit';
import { hasScope, requiredScopeForRoute } from '../auth/scopes';
import type { AuthToken } from '@harness-engineering/types';

/* ── In-memory per-IP rate limiter (no external deps) ── */
const RATE_LIMIT = Number(process.env['HARNESS_RATE_LIMIT']) || 100; // requests per window
const WINDOW_MS = 60_000; // 1-minute sliding window
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Legacy /api/* alias deprecation horizon. Spec D7 cross-cutting decision:
 * "removal scheduled for /api/v2 or 12 months post-Phase-0-GA, whichever
 * comes first." Plan-date 2026-05-14 -> +12mo = 2027-05-14.
 *
 * Set via env var HARNESS_DEPRECATION_DATE for ops who need to extend the
 * horizon; default is the spec-mandated value.
 */
export const DEPRECATION_DATE = process.env['HARNESS_DEPRECATION_DATE'] ?? '2027-05-14';

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
  /** Callback returning the current LocalModelStatus, or null when no local backend is configured. */
  getLocalModelStatus?: GetLocalModelStatusFn;
  /** Callback returning all local backends' statuses, one entry per resolver. Spec 2 SC38. */
  getLocalModelStatuses?: GetLocalModelStatusesFn;
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
  private getLocalModelStatus: GetLocalModelStatusFn | null = null;
  private getLocalModelStatuses: GetLocalModelStatusesFn | null = null;
  private recorder: StreamRecorder | null = null;
  private planWatcher: PlanWatcher | null = null;
  private tokenStore!: TokenStore;
  private auditLogger!: AuditLogger;
  private warnedUnauthDev = false;
  private stateChangeListener!: (snapshot: unknown) => void;
  private agentEventListener!: (event: unknown) => void;
  private readonly apiRoutes: Array<
    (req: http.IncomingMessage, res: http.ServerResponse) => boolean
  >;

  constructor(orchestrator: Snapshotable, port: number, deps?: ServerDependencies) {
    this.orchestrator = orchestrator;
    this.port = port;
    this.initDependencies(deps);
    const tokensPath =
      process.env['HARNESS_TOKENS_PATH'] ?? path.resolve('.harness', 'tokens.json');
    const auditPath = process.env['HARNESS_AUDIT_PATH'] ?? path.resolve('.harness', 'audit.log');
    this.tokenStore = new TokenStore(tokensPath);
    this.auditLogger = new AuditLogger(auditPath);
    this.httpServer = http.createServer(this.handleRequest.bind(this));
    this.broadcaster = new WebSocketBroadcaster(this.httpServer, () =>
      this.orchestrator.getSnapshot()
    );
    this.apiRoutes = this.buildApiRoutes();
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
    this.getLocalModelStatus = deps?.getLocalModelStatus ?? null;
    this.getLocalModelStatuses = deps?.getLocalModelStatuses ?? null;
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
   * @param type - One of 'maintenance:started', 'maintenance:completed', 'maintenance:error', 'maintenance:baseref_fallback'
   * @param data - Event payload (task info, run result, error details, or baseref-fallback diagnostic)
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
   * spec's "SSE topic" wording is approximate. Phase 5 widens the payload
   * to `NamedLocalModelStatus` (with `backendName` + `endpoint`); the channel
   * and bind-before-probe ordering are unchanged.
   */
  public broadcastLocalModelStatus(
    status: import('@harness-engineering/types').NamedLocalModelStatus
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
    const isState =
      req.method === 'GET' && (req.url === '/api/state' || req.url === '/api/v1/state');
    // Per-IP rate limiting (state endpoint exempt — still requires auth below)
    if (!isState && !checkRateLimit(req, res)) {
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

  /**
   * Phase 1 auth: bearer token lookup against TokenStore + scope check.
   * Legacy HARNESS_API_TOKEN env var still authenticates as a synthetic
   * admin record (see TokenStore.legacyEnvToken).
   *
   * Returns the resolved AuthToken on success; sends 401/403 + returns null on failure.
   */
  private async resolveAuth(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<AuthToken | null> {
    const authHeader = req.headers['authorization'];
    const legacyEnv = process.env['HARNESS_API_TOKEN'];

    // Tokens file empty AND no env var → unauthenticated mode (localhost dev).
    const listed = await this.tokenStore.list().catch(() => []);
    if (listed.length === 0 && !legacyEnv) {
      // Surface the fallback so operators don't deploy un-authed by accident.
      // Header on every response; one-time warn on first hit per process.
      res.setHeader('X-Harness-Auth-Mode', 'unauth-dev');
      if (!this.warnedUnauthDev) {
        this.warnedUnauthDev = true;
        console.warn(
          'harness orchestrator: running in UNAUTHENTICATED dev mode ' +
            '(tokens.json empty and HARNESS_API_TOKEN not set). ' +
            'All requests resolve as admin. Configure tokens before exposing the API beyond localhost.'
        );
      }
      return {
        id: 'tok_unauth_dev',
        name: 'unauth-dev',
        scopes: ['admin'],
        hashedSecret: '<none>',
        createdAt: new Date(0).toISOString(),
      };
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized — set Authorization: Bearer <token>' }));
      return null;
    }
    const raw = authHeader.slice('Bearer '.length).trim();

    const legacyMatch = this.tokenStore.legacyEnvToken(raw, legacyEnv);
    if (legacyMatch) return legacyMatch;

    const verified = await this.tokenStore.verify(raw);
    if (!verified) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized — invalid or expired token' }));
      return null;
    }
    return verified;
  }

  /**
   * Build the ordered API route table. Each entry is invoked in order and
   * returns true when it has handled the request. Closures capture `this`,
   * so handlers re-read mutable deps (pipeline, recorder, maintenanceDeps)
   * on every request — setters like setPipeline() take effect immediately.
   *
   * Adding a new route is a one-place change: append an entry here.
   */
  private buildApiRoutes(): Array<
    (req: http.IncomingMessage, res: http.ServerResponse) => boolean
  > {
    return [
      // Auth admin routes — scope-gated to `admin` by requiredScopeForRoute.
      // First in the table so the auth surface is unambiguously owned by the orchestrator.
      (req, res) => handleAuthRoute(req, res, this.tokenStore),
      (req, res) =>
        !!this.interactionQueue && handleInteractionsRoute(req, res, this.interactionQueue),
      (req, res) =>
        !!this.interactionQueue &&
        handleV1InteractionsResolveRoute(req, res, this.interactionQueue),
      (req, res) => handlePlansRoute(req, res, this.plansDir),
      (req, res) => handleAnalyzeRoute(req, res, this.pipeline),
      (req, res) => handleAnalysesRoute(req, res, this.analysisArchive),
      (req, res) => handleRoadmapActionsRoute(req, res, this.roadmapPath),
      (req, res) => handleDispatchActionsRoute(req, res, this.dispatchAdHoc),
      (req, res) => handleLocalModelRoute(req, res, this.getLocalModelStatus),
      // Local-models multi-status route (Spec 2 SC38)
      (req, res) => handleLocalModelsRoute(req, res, this.getLocalModelStatuses),
      (req, res) => handleMaintenanceRoute(req, res, this.maintenanceDeps),
      (req, res) => handleV1JobsMaintenanceRoute(req, res, this.maintenanceDeps),
      (req, res) => !!this.recorder && handleStreamsRoute(req, res, this.recorder),
      (req, res) => handleSessionsRoute(req, res, this.sessionsDir),
      // SSE event stream — long-lived; placed near end so cheaper routes
      // short-circuit first, but before the chat-proxy fallback.
      (req, res) => handleV1EventsSseRoute(req, res, this.orchestrator as unknown as EventEmitter),
      // Chat proxy route (spawns Claude Code CLI — no API key required)
      (req, res) => handleChatProxyRoute(req, res, this.claudeCommand),
    ];
  }

  /**
   * Dispatch to API route handlers. Returns true immediately and resolves the
   * request asynchronously (auth + scope check + dispatch + audit log).
   *
   * Static-file fallback for non-/api/* requests requires returning false so
   * `handleRequest` can hand the request off to the static handler.
   */
  private handleApiRoutes(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const url = req.url ?? '';
    // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- URL path, not filesystem path
    if (!url.startsWith('/api/')) return false;
    void this.dispatchAuthedRequest(req, res);
    return true;
  }

  private async dispatchAuthedRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // Resolve auth first (may write 401 + return null).
    const token = await this.resolveAuth(req, res);
    // Register audit on wire-final status — fires once, regardless of which
    // path below resolves the response. Captures the real status the client
    // sees, not whatever was set before an async handler resolved. Phase 2
    // carry-forward fix: prior inline audit() calls sampled res.statusCode
    // synchronously, which for `void handleX(...); return true;` patterns
    // recorded the default 200 instead of the wire-final code.
    res.on('finish', () => this.audit(req, res, token));
    if (!token) return;

    // /api/v1/<name>(/...) aliases for legacy routes.
    // Phase 2 ships the alias by URL rewrite so the 12 legacy handlers stay
    // untouched. Per-handler v1-prefix awareness was rejected (12 file edits +
    // 12× test churn). See spec D7 cross-cutting decision.
    //
    // /api/v1/state is intentionally NOT in the wrappable set; the state
    // endpoint is handled by an inlined shortcut below that already accepts
    // both /api/state and /api/v1/state. The Deprecation header is still
    // stamped on /api/state via the isLegacyPrefix branch.
    const V1_WRAPPABLE = new Set([
      'interactions',
      'plans',
      'analyze',
      'analyses',
      'roadmap-actions',
      'dispatch-actions',
      'local-model',
      'local-models',
      'maintenance',
      'streams',
      'sessions',
      'chat-proxy',
    ]);
    const v1Match = /^\/api\/v1\/([^/?]+)(.*)$/.exec(req.url ?? '');
    const rewrittenSlug = v1Match?.[1];
    if (rewrittenSlug && V1_WRAPPABLE.has(rewrittenSlug)) {
      // Mutate req.url for the route-table loop. Existing handlers match on
      // hardcoded /api/<name> prefixes; rewriting once is cheaper than fanning
      // out 12 wrapper files. /api/v1/state is handled by the shortcut below,
      // not via rewrite.
      req.url = `/api/${rewrittenSlug}${v1Match?.[2] ?? ''}`;
    }
    // Original (pre-rewrite) URL drives the Deprecation header: if the caller
    // hit /api/v1/<wrappable> the v1Match captured it and we MUST NOT stamp
    // Deprecation. If the caller hit /api/<name> directly, v1Match is null and
    // the header lands.
    const isLegacyPrefix =
      !!req.url &&
      // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- URL path, not filesystem
      req.url.startsWith('/api/') &&
      // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- URL path, not filesystem
      !req.url.startsWith('/api/v1/') &&
      !v1Match;
    if (isLegacyPrefix) {
      res.setHeader('Deprecation', DEPRECATION_DATE);
    }

    // Strip query string before scope lookup. scopes.ts uses exact path equality
    // (e.g. `path === '/api/v1/auth/token'`), so passing the raw req.url would
    // cause `/api/v1/auth/token?x=1` to miss every map and return null. Matches
    // the URL normalization already used by audit() (line 411) and handleAuthRoute.
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    const required = requiredScopeForRoute(req.method ?? 'GET', pathname);
    // Default-deny: null required means the route has no scope mapping yet, which
    // ADR 0011 line 30 and scopes.ts:26 both pin as 403, not allow. Phase 1
    // review-cycle 2 caught the prior `if (required && ...)` form was default-permit,
    // which let a read-status bearer mint admin tokens by appending any query string.
    if (!required || !hasScope(token.scopes, required)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Insufficient scope', required: required ?? 'unknown' }));
      return;
    }
    // Inlined state endpoint (previously handled before auth in handleRequest).
    if (req.method === 'GET' && (req.url === '/api/state' || req.url === '/api/v1/state')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.orchestrator.getSnapshot()));
      return;
    }
    for (const route of this.apiRoutes) {
      if (route(req, res)) return;
    }
    // No route matched — emit 404 here so the audit log captures the result.
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  private audit(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    token: AuthToken | null
  ): void {
    void this.auditLogger.append({
      tokenId: token?.id ?? 'anonymous',
      ...(token?.tenantId ? { tenantId: token.tenantId } : {}),
      route: (req.url ?? '').split('?')[0] ?? '',
      method: req.method ?? 'GET',
      status: res.statusCode || 0,
    });
  }

  public get wsClientCount(): number {
    return this.broadcaster.clientCount;
  }

  public async start(): Promise<void> {
    // Refuse to bind to a WHATWG bad port — browsers and Node's fetch() will
    // reject every connection with "bad port", producing silent 502s in the
    // dashboard proxy (issue #287). Better to fail loudly at startup.
    assertPortUsable(this.port, 'orchestrator');

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
