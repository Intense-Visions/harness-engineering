import { describe, it, expect } from 'vitest';
import { app } from '../../src/server/index';

describe('GET /api/health-check', () => {
  it('returns status ok', async () => {
    const res = await app.request('/api/health-check');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
