import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { buildHealthCheckRouter } from './routes/health-check';
import { buildOverviewRouter } from './routes/overview';
import { buildRoadmapRouter } from './routes/roadmap';
import { buildHealthRouter } from './routes/health';
import { buildGraphRouter } from './routes/graph';
import { buildSseRouter } from './routes/sse';
import { buildAdoptionRouter } from './routes/adoption';
import { buildActionsRouter } from './routes/actions';
import { buildCIRouter } from './routes/ci';
import { buildImpactRouter } from './routes/impact';
import { buildDecayTrendsRouter } from './routes/decay-trends';
import { buildTraceabilityRouter } from './routes/traceability';
import { buildContext, type ServerContext } from './context';
import { SSEManager } from './sse';
import { DASHBOARD_PORT } from '../shared/constants';
import { orchestratorProxyMiddleware, getOrchestratorTarget } from './orchestrator-proxy';

export function buildApp(ctx: ServerContext): Hono {
  const app = new Hono();

  const clientPort = process.env['DASHBOARD_CLIENT_PORT'] ?? String(DASHBOARD_PORT);
  const bindHost = process.env['HOST'] ?? '127.0.0.1';

  // Build CORS allow-list: always include localhost/127.0.0.1, plus the bind host
  const corsOrigins = [`http://localhost:${clientPort}`, `http://127.0.0.1:${clientPort}`];
  if (bindHost !== '127.0.0.1' && bindHost !== 'localhost') {
    corsOrigins.push(`http://${bindHost}:${clientPort}`);
  }

  // Middleware
  app.use('*', logger());
  app.use('*', cors({ origin: corsOrigins }));

  // Orchestrator proxy — must be registered before dashboard API routes
  // so orchestrator-specific prefixes are forwarded rather than 404'd.
  if (getOrchestratorTarget()) {
    app.use('*', orchestratorProxyMiddleware());
  }

  // API routes
  app.route('/api', buildHealthCheckRouter());
  app.route('/api', buildOverviewRouter(ctx));
  app.route('/api', buildRoadmapRouter(ctx));
  app.route('/api', buildHealthRouter(ctx));
  app.route('/api', buildGraphRouter(ctx));
  app.route('/api', buildSseRouter(ctx));
  app.route('/api', buildAdoptionRouter(ctx));
  app.route('/api', buildActionsRouter(ctx));
  app.route('/api', buildCIRouter(ctx));
  app.route('/api', buildImpactRouter(ctx));
  app.route('/api', buildDecayTrendsRouter(ctx));
  app.route('/api', buildTraceabilityRouter(ctx));

  // Auth admin routes (/api/v1/auth/*) are owned by the orchestrator and
  // reached through the orchestrator proxy registered above. The dashboard
  // intentionally does NOT mount a parallel TokenStore surface — keeping a
  // single writer to .harness/tokens.json (orchestrator) and avoiding the
  // unauthenticated-CRUD finding (review: dashboard-tokens-unauthenticated).

  // Serve built client static files (assets, etc.)
  const clientRoot = process.env['DASHBOARD_CLIENT_ROOT'];
  if (clientRoot) {
    app.use('/assets/*', serveStatic({ root: clientRoot }));
    // SPA fallback: serve index.html for all non-API routes
    app.get('*', serveStatic({ root: clientRoot, path: '/index.html' }));
  }

  return app;
}

const app = buildApp(buildContext({ sseManager: new SSEManager() }));

export { app };
