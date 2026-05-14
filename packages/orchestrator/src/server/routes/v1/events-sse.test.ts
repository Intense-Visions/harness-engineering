import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { handleV1EventsSseRoute } from './events-sse';

function makeReqRes(
  method: string,
  url: string,
  headers: Record<string, string> = {}
): { req: IncomingMessage; res: ServerResponse; chunks: string[] } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.headers = { accept: 'text/event-stream', ...headers };
  req.push(null);
  const res = new ServerResponse(req);
  // Capture writes for assertions.
  const chunks: string[] = [];
  const origWrite = res.write.bind(res);
  res.write = ((c: string | Buffer): boolean => {
    chunks.push(typeof c === 'string' ? c : c.toString('utf-8'));
    return origWrite(c as never);
  }) as typeof res.write;
  return { req, res, chunks };
}

describe('GET /api/v1/events SSE', () => {
  it('returns false for non-matching paths', () => {
    const emitter = new EventEmitter();
    const { req, res } = makeReqRes('GET', '/api/state');
    expect(handleV1EventsSseRoute(req, res, emitter)).toBe(false);
  });

  it('writes SSE headers and an initial comment frame', () => {
    const emitter = new EventEmitter();
    const { req, res, chunks } = makeReqRes('GET', '/api/v1/events');
    const handled = handleV1EventsSseRoute(req, res, emitter);
    expect(handled).toBe(true);
    expect(res.getHeader('Content-Type')).toBe('text/event-stream');
    expect(res.getHeader('Cache-Control')).toBe('no-cache');
    expect(res.getHeader('Connection')).toBe('keep-alive');
    expect(chunks.some((c) => c.startsWith(':'))).toBe(true);
  });

  it('emits an event frame when emitter fires a subscribed topic', async () => {
    const emitter = new EventEmitter();
    const { req, res, chunks } = makeReqRes('GET', '/api/v1/events');
    handleV1EventsSseRoute(req, res, emitter);
    emitter.emit('interaction.created', { id: 'int_abc', issueId: 'iss_1' });
    await new Promise((r) => setImmediate(r));
    const joined = chunks.join('');
    expect(joined).toMatch(/event: interaction\.created\n/);
    expect(joined).toMatch(/data: \{"id":"int_abc",.+\}\n/);
    expect(joined).toMatch(/id: evt_[a-f0-9]{16}\n\n/);
  });

  it('removes listeners on client disconnect', () => {
    const emitter = new EventEmitter();
    const { req, res } = makeReqRes('GET', '/api/v1/events');
    handleV1EventsSseRoute(req, res, emitter);
    const before = emitter.listenerCount('state_change');
    res.emit('close');
    expect(emitter.listenerCount('state_change')).toBe(before - 1);
  });
});
