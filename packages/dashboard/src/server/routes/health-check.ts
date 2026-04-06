import { Hono } from 'hono';
import type { HealthCheckResponse } from '../../shared/types';

const healthCheck = new Hono();

healthCheck.get('/health-check', (c) => {
  const response: HealthCheckResponse = { status: 'ok' };
  return c.json(response);
});

export { healthCheck };
