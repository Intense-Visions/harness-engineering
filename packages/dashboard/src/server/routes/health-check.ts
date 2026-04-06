import { Hono } from 'hono';
import type { HealthCheckResponse } from '../../shared/types';

export function buildHealthCheckRouter(): Hono {
  const router = new Hono();
  router.get('/health-check', (c) => {
    const response: HealthCheckResponse = { status: 'ok' };
    return c.json(response);
  });
  return router;
}
