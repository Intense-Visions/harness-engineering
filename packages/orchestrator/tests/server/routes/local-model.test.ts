import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import type { LocalModelStatus, NamedLocalModelStatus } from '@harness-engineering/types';
import {
  handleLocalModelRoute,
  handleLocalModelsRoute,
} from '../../../src/server/routes/local-model';

function createServer(getStatus: (() => LocalModelStatus | null) | null): http.Server {
  return http.createServer((req, res) => {
    if (!handleLocalModelRoute(req, res, getStatus)) {
      res.writeHead(404);
      res.end();
    }
  });
}

function createMultiServer(getStatuses: (() => NamedLocalModelStatus[]) | null): http.Server {
  return http.createServer((req, res) => {
    if (!handleLocalModelsRoute(req, res, getStatuses)) {
      res.writeHead(404);
      res.end();
    }
  });
}

function request(
  server: http.Server,
  port: number,
  method: string,
  urlPath: string
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: urlPath, method }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ statusCode: res.statusCode ?? 500, body: parsed });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const HEALTHY_STATUS: LocalModelStatus = {
  available: true,
  resolved: 'gemma-4-e4b',
  configured: ['gemma-4-e4b', 'qwen3:8b'],
  detected: ['gemma-4-e4b', 'qwen3:8b'],
  lastProbeAt: '2026-04-30T12:00:00.000Z',
  lastError: null,
  warnings: [],
};

const UNHEALTHY_STATUS: LocalModelStatus = {
  available: false,
  resolved: null,
  configured: ['bogus'],
  detected: [],
  lastProbeAt: '2026-04-30T12:00:00.000Z',
  lastError: 'fetch failed',
  warnings: ['No configured candidate is loaded.'],
};

const NAMED_HEALTHY: NamedLocalModelStatus = {
  ...HEALTHY_STATUS,
  backendName: 'local',
  endpoint: 'http://localhost:1234/v1',
};

const NAMED_UNHEALTHY: NamedLocalModelStatus = {
  ...UNHEALTHY_STATUS,
  backendName: 'pi-2',
  endpoint: 'http://192.168.1.50:1234/v1',
};

describe('handleLocalModelRoute', () => {
  let server: http.Server;
  let port: number;

  async function listen(getStatus: (() => LocalModelStatus | null) | null): Promise<void> {
    server = createServer(getStatus);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') port = addr.port;
        resolve();
      });
    });
  }

  afterEach(() => {
    server?.close();
  });

  it('returns 200 with LocalModelStatus when resolver has a snapshot (SC17 / OT1)', async () => {
    await listen(() => HEALTHY_STATUS);
    const res = await request(server, port, 'GET', '/api/v1/local-model/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(HEALTHY_STATUS);
  });

  it('returns 200 with unhealthy status (banner data) when not available', async () => {
    await listen(() => UNHEALTHY_STATUS);
    const res = await request(server, port, 'GET', '/api/v1/local-model/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(UNHEALTHY_STATUS);
  });

  it('returns 503 when getStatus is null (no local backend) (SC17 / OT2)', async () => {
    await listen(null);
    const res = await request(server, port, 'GET', '/api/v1/local-model/status');
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Local backend not configured' });
  });

  it('returns 503 when getStatus returns null', async () => {
    await listen(() => null);
    const res = await request(server, port, 'GET', '/api/v1/local-model/status');
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Local backend not configured' });
  });

  it('returns 405 for POST /api/v1/local-model/status', async () => {
    await listen(() => HEALTHY_STATUS);
    const res = await request(server, port, 'POST', '/api/v1/local-model/status');
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });

  it('returns false (does not match) for unrelated paths', async () => {
    await listen(() => HEALTHY_STATUS);
    const res = await request(server, port, 'GET', '/api/v1/some-other-path');
    expect(res.statusCode).toBe(404);
  });
});

describe('handleLocalModelsRoute (plural — SC38)', () => {
  let server: http.Server;
  let port: number;

  async function listen(getStatuses: (() => NamedLocalModelStatus[]) | null): Promise<void> {
    server = createMultiServer(getStatuses);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') port = addr.port;
        resolve();
      });
    });
  }

  afterEach(() => {
    server?.close();
  });

  it('returns 200 with NamedLocalModelStatus[] when resolvers exist (SC38)', async () => {
    await listen(() => [NAMED_HEALTHY, NAMED_UNHEALTHY]);
    const res = await request(server, port, 'GET', '/api/v1/local-models/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([NAMED_HEALTHY, NAMED_UNHEALTHY]);
  });

  it('returns 200 with empty array when zero local backends configured', async () => {
    await listen(() => []);
    const res = await request(server, port, 'GET', '/api/v1/local-models/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 with empty array when getStatuses callback is null (no local backends path)', async () => {
    await listen(null);
    const res = await request(server, port, 'GET', '/api/v1/local-models/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 405 for POST /api/v1/local-models/status', async () => {
    await listen(() => [NAMED_HEALTHY]);
    const res = await request(server, port, 'POST', '/api/v1/local-models/status');
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });

  it('returns false (does not match) for unrelated paths', async () => {
    await listen(() => [NAMED_HEALTHY]);
    const res = await request(server, port, 'GET', '/api/v1/some-other-path');
    expect(res.statusCode).toBe(404);
  });
});
