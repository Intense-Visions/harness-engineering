import { serve } from '@hono/node-server';
import { app } from './index';
import { API_PORT } from '../shared/constants';

const port = Number(process.env['DASHBOARD_API_PORT'] ?? API_PORT);

console.log(`Hono server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname: '127.0.0.1',
});
