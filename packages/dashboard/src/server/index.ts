import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { healthCheck } from './routes/health-check';
import { buildOverviewRouter } from './routes/overview';
import { buildRoadmapRouter } from './routes/roadmap';
import { buildHealthRouter } from './routes/health';
import { buildGraphRouter } from './routes/graph';
import { buildSseRouter } from './routes/sse';
import { buildActionsRouter } from './routes/actions';
import { buildContext } from './context';
import { DASHBOARD_PORT } from '../shared/constants';

const ctx = buildContext();
const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: [`http://localhost:${DASHBOARD_PORT}`, `http://127.0.0.1:${DASHBOARD_PORT}`],
  })
);

// API routes
app.route('/api', healthCheck);
app.route('/api', buildOverviewRouter(ctx));
app.route('/api', buildRoadmapRouter(ctx));
app.route('/api', buildHealthRouter(ctx));
app.route('/api', buildGraphRouter(ctx));
app.route('/api', buildSseRouter(ctx));
app.route('/api', buildActionsRouter(ctx));

export { app };
