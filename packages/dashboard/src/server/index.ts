import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { healthCheck } from './routes/health-check';
import { DASHBOARD_PORT } from '../shared/constants';

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

export { app };
