import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { handleV1EventsSseRoute, getSseEventLog } from './events-sse';

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

  it('emits an event frame with a monotonic numeric id when a topic fires', async () => {
    const emitter = new EventEmitter();
    const { req, res, chunks } = makeReqRes('GET', '/api/v1/events');
    handleV1EventsSseRoute(req, res, emitter);
    emitter.emit('interaction.created', { id: 'int_abc', issueId: 'iss_1' });
    await new Promise((r) => setImmediate(r));
    const joined = chunks.join('');
    expect(joined).toMatch(/event: interaction\.created\n/);
    expect(joined).toMatch(/data: \{"id":"int_abc",.+\}\n/);
    expect(joined).toMatch(/id: \d+\n\n/);
  });

  it('assigns strictly increasing ids across events', async () => {
    const emitter = new EventEmitter();
    const { req, res, chunks } = makeReqRes('GET', '/api/v1/events');
    handleV1EventsSseRoute(req, res, emitter);
    emitter.emit('state_change', { a: 1 });
    emitter.emit('state_change', { a: 2 });
    await new Promise((r) => setImmediate(r));
    const ids = [...chunks.join('').matchAll(/id: (\d+)\n\n/g)].map((m) => Number(m[1]));
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBeGreaterThan(ids[0]!);
  });

  it('stops delivering to a disconnected client (subscription cleanup)', async () => {
    const emitter = new EventEmitter();
    const { req, res, chunks } = makeReqRes('GET', '/api/v1/events');
    handleV1EventsSseRoute(req, res, emitter);
    res.emit('close');
    emitter.emit('state_change', { after: 'close' });
    await new Promise((r) => setImmediate(r));
    expect(chunks.join('')).not.toContain('after');
  });

  it('replays buffered events after Last-Event-ID on reconnect', async () => {
    const emitter = new EventEmitter();
    // First connection: receives three events and notes the first id.
    const first = makeReqRes('GET', '/api/v1/events');
    handleV1EventsSseRoute(first.req, first.res, emitter);
    emitter.emit('state_change', { n: 1 });
    emitter.emit('state_change', { n: 2 });
    emitter.emit('state_change', { n: 3 });
    await new Promise((r) => setImmediate(r));
    const ids = [...first.chunks.join('').matchAll(/id: (\d+)\n\n/g)].map((m) => Number(m[1]));
    expect(ids).toHaveLength(3);
    first.res.emit('close');

    // Reconnect with Last-Event-ID = id of event #1: must replay #2 and #3 only.
    const resume = makeReqRes('GET', '/api/v1/events', { 'last-event-id': String(ids[0]) });
    handleV1EventsSseRoute(resume.req, resume.res, emitter);
    const replayed = resume.chunks.join('');
    expect(replayed).toContain('"n":2');
    expect(replayed).toContain('"n":3');
    expect(replayed).not.toContain('"n":1');
  });

  it('without Last-Event-ID, a fresh connection replays nothing', async () => {
    const emitter = new EventEmitter();
    const warmup = makeReqRes('GET', '/api/v1/events');
    handleV1EventsSseRoute(warmup.req, warmup.res, emitter);
    emitter.emit('state_change', { historical: true });
    await new Promise((r) => setImmediate(r));
    warmup.res.emit('close');

    const fresh = makeReqRes('GET', '/api/v1/events');
    handleV1EventsSseRoute(fresh.req, fresh.res, emitter);
    expect(fresh.chunks.join('')).not.toContain('historical');
  });

  it('ignores a non-numeric Last-Event-ID (legacy client) and resumes live', async () => {
    const emitter = new EventEmitter();
    const log = getSseEventLog(emitter);
    log.replayFrom(0); // touch the log so it exists for this bus
    const { req, res, chunks } = makeReqRes('GET', '/api/v1/events', {
      'last-event-id': 'evt_deadbeefdeadbeef',
    });
    expect(() => handleV1EventsSseRoute(req, res, emitter)).not.toThrow();
    emitter.emit('state_change', { live: true });
    await new Promise((r) => setImmediate(r));
    expect(chunks.join('')).toContain('live');
  });
});
