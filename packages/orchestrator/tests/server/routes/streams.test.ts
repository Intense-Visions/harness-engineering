import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import { handleStreamsRoute } from '../../../src/server/routes/streams';
import type { StreamRecorder, StreamManifest } from '../../../src/core/stream-recorder';

const sampleManifest: StreamManifest = {
  issueId: 'H-123',
  externalId: 42,
  identifier: 'issue-123',
  attempts: [
    {
      attempt: 1,
      file: '1.jsonl',
      startedAt: '2026-04-21T00:00:00Z',
      endedAt: null,
      outcome: null,
      stats: {
        durationMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        turnCount: 0,
        toolsCalled: [],
        filesTouched: [],
      },
    },
  ],
  pr: null,
  retention: { strategy: 'orphan', orphanExpiresAt: null },
  highlights: null,
};

function mockRecorder(overrides?: Partial<StreamRecorder>): StreamRecorder {
  return {
    getManifest: vi.fn().mockReturnValue(null),
    getStream: vi.fn().mockReturnValue(null),
    startRecording: vi.fn(),
    appendEvent: vi.fn(),
    endRecording: vi.fn(),
    linkPR: vi.fn(),
    extractHighlights: vi.fn(),
    pruneOrphans: vi.fn(),
    listIssues: vi.fn().mockReturnValue([]),
    listSessions: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as StreamRecorder;
}

function createServer(recorder: StreamRecorder): http.Server {
  return http.createServer((req, res) => {
    if (!handleStreamsRoute(req, res, recorder)) {
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
): Promise<{ statusCode: number; body: unknown; contentType: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let body: unknown;
        try {
          body = JSON.parse(data);
        } catch {
          body = data;
        }
        resolve({
          statusCode: res.statusCode ?? 500,
          body,
          contentType: res.headers['content-type'] ?? '',
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('streams routes', () => {
  let server: http.Server;
  let port: number;

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  async function start(recorder: StreamRecorder): Promise<void> {
    server = createServer(recorder);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  }

  it('returns false for non-stream URLs', async () => {
    const recorder = mockRecorder();
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/other');
    expect(res.statusCode).toBe(404);
  });

  it('returns false for non-GET methods', async () => {
    const recorder = mockRecorder();
    await start(recorder);
    const res = await request(server, port, 'POST', '/api/streams/H-1');
    expect(res.statusCode).toBe(404);
  });

  it('returns session list when no issueId specified', async () => {
    const recorder = mockRecorder({
      listSessions: vi.fn().mockReturnValue([sampleManifest]),
    });
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([sampleManifest]);
    expect(recorder.listSessions).toHaveBeenCalled();
  });

  it('returns 400 for unsafe issueId', async () => {
    const recorder = mockRecorder();
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/bad%20id');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid issueId' });
  });

  it('returns manifest when tail is "manifest"', async () => {
    const recorder = mockRecorder({ getManifest: vi.fn().mockReturnValue(sampleManifest) });
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/H-123/manifest');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(sampleManifest);
    expect(recorder.getManifest).toHaveBeenCalledWith('H-123');
  });

  it('returns 404 when manifest not found', async () => {
    const recorder = mockRecorder();
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/H-999/manifest');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Stream not found' });
  });

  it('returns stream for specific attempt', async () => {
    const ndjson = '{"type":"turn_start"}\n{"type":"turn_end"}\n';
    const recorder = mockRecorder({ getStream: vi.fn().mockReturnValue(ndjson) });
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/H-123/1');
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe('application/x-ndjson');
    expect(res.body).toBe(ndjson);
    expect(recorder.getStream).toHaveBeenCalledWith('H-123', 1);
  });

  it('returns 404 when stream attempt not found', async () => {
    const recorder = mockRecorder();
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/H-123/5');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Stream not found' });
  });

  it('returns 400 for non-numeric attempt', async () => {
    const recorder = mockRecorder();
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/H-123/abc');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid attempt number' });
  });

  it('returns 400 for attempt < 1', async () => {
    const recorder = mockRecorder();
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/H-123/0');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid attempt number' });
  });

  it('returns 400 for unsafe tail segment', async () => {
    const recorder = mockRecorder();
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/H-123/a%20b');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid attempt' });
  });

  it('returns latest stream when no tail specified', async () => {
    const ndjson = '{"type":"latest"}\n';
    const recorder = mockRecorder({ getStream: vi.fn().mockReturnValue(ndjson) });
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/H-123');
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe('application/x-ndjson');
    expect(recorder.getStream).toHaveBeenCalledWith('H-123', undefined);
  });

  it('returns 404 when latest stream not found', async () => {
    const recorder = mockRecorder();
    await start(recorder);
    const res = await request(server, port, 'GET', '/api/streams/H-123');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Stream not found' });
  });
});
