import { describe, it, expect, vi } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { handleV1InteractionsResolveRoute } from './interactions-resolve';
import type { InteractionQueue, PendingInteraction } from '../../../core/interaction-queue';

function makeReqRes(
  method: string,
  url: string,
  body?: string
): { req: IncomingMessage; res: ServerResponse; sent: () => { status: number; body: string } } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  if (body) {
    process.nextTick(() => {
      req.push(body);
      req.push(null);
    });
  } else {
    req.push(null);
  }
  const res = new ServerResponse(req);
  let status = 0;
  let buf = '';
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = ((s: number, ...rest: unknown[]) => {
    status = s;
    return origWriteHead(s, ...(rest as []));
  }) as typeof res.writeHead;
  const origEnd = res.end.bind(res);
  res.end = ((chunk?: unknown) => {
    if (typeof chunk === 'string') buf += chunk;
    return origEnd(chunk as never);
  }) as typeof res.end;
  return { req, res, sent: () => ({ status, body: buf }) };
}

function fakeQueue(
  list: PendingInteraction[],
  updateStatus: InteractionQueue['updateStatus'] = vi.fn().mockResolvedValue(undefined)
): InteractionQueue {
  return {
    list: vi.fn().mockResolvedValue(list),
    updateStatus,
  } as unknown as InteractionQueue;
}

function pending(id: string, overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id,
    type: 'question',
    payload: { text: 'q' } as never,
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as PendingInteraction;
}

describe('POST /api/v1/interactions/{id}/resolve', () => {
  it('returns 200 on valid POST and calls updateStatus(id, "resolved")', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const queue = fakeQueue([pending('int_abc')], update);
    const { req, res, sent } = makeReqRes('POST', '/api/v1/interactions/int_abc/resolve');
    const handled = handleV1InteractionsResolveRoute(req, res, queue);
    expect(handled).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(sent().status).toBe(200);
    expect(update).toHaveBeenCalledWith('int_abc', 'resolved');
  });

  it('returns false (does not match) for non-matching paths', () => {
    const queue = fakeQueue([]);
    const { req, res } = makeReqRes('POST', '/api/v1/interactions/int_abc');
    expect(handleV1InteractionsResolveRoute(req, res, queue)).toBe(false);
  });

  it('returns false (does not match) for GET on the resolve path', () => {
    const queue = fakeQueue([]);
    const { req, res } = makeReqRes('GET', '/api/v1/interactions/int_abc/resolve');
    expect(handleV1InteractionsResolveRoute(req, res, queue)).toBe(false);
  });

  it('returns false (does not match) for unsafe id characters', () => {
    const queue = fakeQueue([]);
    const { req, res } = makeReqRes('POST', '/api/v1/interactions/bad%20id/resolve');
    expect(handleV1InteractionsResolveRoute(req, res, queue)).toBe(false);
  });

  it('returns 404 when interaction is missing', async () => {
    const queue = fakeQueue([]); // no interactions
    const { req, res, sent } = makeReqRes('POST', '/api/v1/interactions/int_missing/resolve');
    handleV1InteractionsResolveRoute(req, res, queue);
    await new Promise((r) => setTimeout(r, 10));
    expect(sent().status).toBe(404);
  });

  it('returns 409 when interaction is already resolved', async () => {
    const queue = fakeQueue([pending('int_done', { status: 'resolved' })]);
    const { req, res, sent } = makeReqRes('POST', '/api/v1/interactions/int_done/resolve');
    handleV1InteractionsResolveRoute(req, res, queue);
    await new Promise((r) => setTimeout(r, 10));
    expect(sent().status).toBe(409);
  });

  it('returns 400 on invalid JSON body', async () => {
    const queue = fakeQueue([pending('int_abc')]);
    const { req, res, sent } = makeReqRes(
      'POST',
      '/api/v1/interactions/int_abc/resolve',
      'not-json'
    );
    handleV1InteractionsResolveRoute(req, res, queue);
    await new Promise((r) => setTimeout(r, 10));
    expect(sent().status).toBe(400);
  });
});
