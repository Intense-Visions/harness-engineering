import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { handleChatProxyRoute } from '../../../src/server/routes/chat-proxy';

// Mock Anthropic client to avoid real API calls
const mockStream = {
  async *[Symbol.asyncIterator]() {
    yield {
      type: 'content_block_delta' as const,
      index: 0,
      delta: { type: 'text_delta' as const, text: 'Hello' },
    };
    yield {
      type: 'content_block_delta' as const,
      index: 0,
      delta: { type: 'text_delta' as const, text: ' world' },
    };
  },
  async finalMessage() {
    return {
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  },
};

const mockAnthropicClient = {
  messages: {
    stream: vi.fn().mockReturnValue(mockStream),
  },
};

function createServer(): http.Server {
  return http.createServer((req, res) => {
    if (!handleChatProxyRoute(req, res, mockAnthropicClient as any)) {
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

describe('chat proxy route', () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    port = Math.floor(Math.random() * 10000) + 32000;
    mockAnthropicClient.messages.stream.mockReturnValue(mockStream);
    server = createServer();
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(() => {
    server.close();
  });

  it('POST /api/chat streams SSE responses', async () => {
    const res = await postRequest(port, '/api/chat', {
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.body).toContain('data: ');
    expect(res.body).toContain('Hello');
    expect(res.body).toContain(' world');
    expect(res.body).toContain('[DONE]');
  });

  it('POST /api/chat returns 400 when messages are missing', async () => {
    const res = await postRequest(port, '/api/chat', {});
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/chat passes system prompt when provided', async () => {
    await postRequest(port, '/api/chat', {
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'You are a helpful assistant.',
    });

    expect(mockAnthropicClient.messages.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'You are a helpful assistant.',
      })
    );
  });

  it('returns false for non-matching routes', async () => {
    const res = await postRequest(port, '/api/other', {});
    expect(res.statusCode).toBe(404);
  });
});
