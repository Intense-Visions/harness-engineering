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
    on: vi.fn((event: string, _cb: (...args: unknown[]) => void) => {
      if (event === 'error') {
        // store error handler but don't fire
      }
      return child;
    }),
  });

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

describe('chat proxy route (Claude Code session mode)', () => {
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

  it('streams SSE responses with session ID', async () => {
    const child = createMockChild([
      { type: 'content_block_delta', delta: { thinking: 'Let me think...' } },
      { type: 'content_block_delta', delta: { text: 'Hello world' } },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const res = await postRequest(port, '/api/chat', { prompt: 'Hello' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    // Should contain session ID event
    expect(res.body).toContain('"type":"session"');
    expect(res.body).toContain('"sessionId"');
    // Should contain thinking and text
    expect(res.body).toContain('"type":"thinking"');
    expect(res.body).toContain('Let me think...');
    expect(res.body).toContain('"type":"text"');
    expect(res.body).toContain('Hello world');
    expect(res.body).toContain('[DONE]');
  });

  it('returns 400 when prompt is missing', async () => {
    const res = await postRequest(port, '/api/chat', {});
    expect(res.statusCode).toBe(400);
  });

  it('includes system prompt on first turn and uses --session-id', async () => {
    const child = createMockChild([{ type: 'result', result: 'OK' }]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    await postRequest(port, '/api/chat', {
      prompt: 'Hi',
      system: 'You are a helpful assistant.',
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining([
        '--print',
        '-p',
        expect.stringContaining('You are a helpful assistant.'),
        '--session-id',
      ]),
      expect.any(Object)
    );
  });

  it('uses --resume on subsequent turns', async () => {
    const child = createMockChild([{ type: 'result', result: 'OK' }]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    await postRequest(port, '/api/chat', {
      prompt: 'Continue',
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--resume', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890']),
      expect.any(Object)
    );
  });

  it('emits tool_use and tool_result events', async () => {
    const child = createMockChild([
      {
        type: 'content_block_start',
        content_block: { type: 'tool_use', name: 'Read', input: { file_path: '/foo.ts' } },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', content: 'file contents here', tool_use_id: 'x' }],
        },
      },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const res = await postRequest(port, '/api/chat', { prompt: 'Read a file' });

    expect(res.body).toContain('"type":"tool_use"');
    expect(res.body).toContain('"tool":"Read"');
    expect(res.body).toContain('"type":"tool_result"');
    expect(res.body).toContain('file contents here');
  });

  it('returns false for non-matching routes', async () => {
    const res = await postRequest(port, '/api/other', {});
    expect(res.statusCode).toBe(404);
  });
});
