import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { CacheMetricsRecorder } from '@harness-engineering/core';
import { handleV1TelemetryRoute } from './telemetry';

function makeReq(method: string, url: string): IncomingMessage {
  const r = new IncomingMessage(new Socket());
  r.method = method;
  r.url = url;
  process.nextTick(() => r.emit('end'));
  return r;
}

function makeRes(): {
  res: ServerResponse;
  chunks: string[];
  statusCode: () => number;
} {
  const sock = new Socket();
  const r = new ServerResponse(new IncomingMessage(sock));
  const chunks: string[] = [];
  r.write = ((c: string) => {
    chunks.push(String(c));
    return true;
  }) as ServerResponse['write'];
  r.end = ((c?: string) => {
    if (c) chunks.push(String(c));
    return r;
  }) as ServerResponse['end'];
  return { res: r, chunks, statusCode: () => r.statusCode };
}

describe('handleV1TelemetryRoute', () => {
  it('GET /api/v1/telemetry/cache/stats returns 200 with the PromptCacheStats body', async () => {
    const cacheMetrics = new CacheMetricsRecorder();
    // Seed: 7 hits + 3 misses → hitRate 0.7
    for (let i = 0; i < 7; i++) cacheMetrics.record('anthropic', true, 0, 100);
    for (let i = 0; i < 3; i++) cacheMetrics.record('anthropic', false, 100, 0);

    const req = makeReq('GET', '/api/v1/telemetry/cache/stats');
    const { res, chunks, statusCode } = makeRes();
    const handled = handleV1TelemetryRoute(req, res, { cacheMetrics });

    expect(handled).toBe(true);
    expect(statusCode()).toBe(200);
    const body = JSON.parse(chunks.join('')) as {
      totalRequests: number;
      hits: number;
      misses: number;
      hitRate: number;
      byBackend: Record<string, { hits: number; misses: number }>;
    };
    expect(body.totalRequests).toBe(10);
    expect(body.hits).toBe(7);
    expect(body.misses).toBe(3);
    expect(body.hitRate).toBeCloseTo(0.7, 5);
    expect(body.byBackend['anthropic']).toEqual({ hits: 7, misses: 3 });
  });

  it('GET /api/v1/telemetry/cache/stats returns 503 when cacheMetrics is missing', async () => {
    const req = makeReq('GET', '/api/v1/telemetry/cache/stats');
    const { res, chunks, statusCode } = makeRes();
    const handled = handleV1TelemetryRoute(req, res, {});

    expect(handled).toBe(true);
    expect(statusCode()).toBe(503);
    expect(chunks.join('')).toContain('not available');
  });

  it('returns false for non-matching paths (route fall-through)', () => {
    const cacheMetrics = new CacheMetricsRecorder();
    const req = makeReq('GET', '/api/v1/somewhere/else');
    const { res } = makeRes();
    expect(handleV1TelemetryRoute(req, res, { cacheMetrics })).toBe(false);
  });

  it('returns false for non-GET methods on the cache stats path', () => {
    const cacheMetrics = new CacheMetricsRecorder();
    const req = makeReq('POST', '/api/v1/telemetry/cache/stats');
    const { res } = makeRes();
    expect(handleV1TelemetryRoute(req, res, { cacheMetrics })).toBe(false);
  });
});
