import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { healthCheck } from './routes/health-check';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// API routes
app.route('/api', healthCheck);

export { app };
