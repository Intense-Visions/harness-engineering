import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { buildHealthCheckRouter } from './routes/health-check';
import { buildOverviewRouter } from './routes/overview';
import { buildRoadmapRouter } from './routes/roadmap';
import { buildHealthRouter } from './routes/health';
import { buildGraphRouter } from './routes/graph';
import { buildSseRouter } from './routes/sse';
import { buildActionsRouter } from './routes/actions';
import { buildCIRouter } from './routes/ci';
import { buildImpactRouter } from './routes/impact';
import { buildContext, type ServerContext } from './context';
import { DASHBOARD_PORT } from '../shared/constants';

export function buildApp(ctx: ServerContext): Hono {
  const app = new Hono();

  const clientPort = process.env['DASHBOARD_CLIENT_PORT'] ?? String(DASHBOARD_PORT);

  // Middleware
  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: [`http://localhost:${clientPort}`, `http://127.0.0.1:${clientPort}`],
    })
  );

  // API routes
  app.route('/api', buildHealthCheckRouter());
  app.route('/api', buildOverviewRouter(ctx));
  app.route('/api', buildRoadmapRouter(ctx));
  app.route('/api', buildHealthRouter(ctx));
  app.route('/api', buildGraphRouter(ctx));
  app.route('/api', buildSseRouter(ctx));
  app.route('/api', buildActionsRouter(ctx));
  app.route('/api', buildCIRouter(ctx));
  app.route('/api', buildImpactRouter(ctx));

  return app;
}

const app = buildApp(buildContext());

export { app };
