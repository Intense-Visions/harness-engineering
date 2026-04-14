import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as child_process from 'node:child_process';
import { PassThrough } from 'node:stream';
import { handleChatProxyRoute } from '../../../src/server/routes/chat-proxy';

// Mock child_process.spawn to avoid launching real claude processes
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof child_process>('node:child_process');
  return { ...actual, spawn: vi.fn() };
});

function createMockChild(events: Array<Record<string, unknown>>) {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const child = Object.assign(new PassThrough(), {
    stdout,
    stderr: new PassThrough(),
    stdin,
    pid: 12345,
    exitCode: null as number | null,
    kill: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'error') {
        // store error handler but don't fire
      }
      return child;
    }),
  });

  // Stream events then close
  setTimeout(() => {
    for (const evt of events) {
      stdout.write(JSON.stringify(evt) + '\n');
    }
    stdout.end();
    child.exitCode = 0;
  }, 10);

  return child;
}

function createServer(command = 'claude'): http.Server {
  return http.createServer((req, res) => {
    if (!handleChatProxyRoute(req, res, command)) {
      res.writeHead(404);
      res.end();
    }
  });
}

function postRequest(
  port: number,
  urlPath: string,
  body: unknown
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 500,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

describe('chat proxy route (Claude Code subprocess)', () => {
  let server: http.Server;
  let port: number;
  const mockSpawn = vi.mocked(child_process.spawn);

  beforeEach(async () => {
    port = Math.floor(Math.random() * 10000) + 32000;
    server = createServer();
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(() => {
    server.close();
    vi.restoreAllMocks();
  });

  it('POST /api/chat streams SSE responses from Claude Code', async () => {
    const child = createMockChild([
      { type: 'progress', content: 'Hello' },
      { type: 'progress', content: ' world' },
      { type: 'result', result: 'Done', usage: { input_tokens: 10, output_tokens: 5 } },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const res = await postRequest(port, '/api/chat', {
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.body).toContain('Hello');
    expect(res.body).toContain(' world');
    expect(res.body).toContain('[DONE]');
  });

  it('POST /api/chat returns 400 when messages are missing', async () => {
    const res = await postRequest(port, '/api/chat', {});
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/chat includes system prompt in CLI args', async () => {
    const child = createMockChild([{ type: 'progress', content: 'Response' }]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    await postRequest(port, '/api/chat', {
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'You are a helpful assistant.',
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining([
        '--print',
        '-p',
        expect.stringContaining('You are a helpful assistant.'),
      ]),
      expect.any(Object)
    );
  });

  it('returns false for non-matching routes', async () => {
    const res = await postRequest(port, '/api/other', {});
    expect(res.statusCode).toBe(404);
  });
});
