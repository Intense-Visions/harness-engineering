import { describe, it, expect, vi } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { handleV1JobsMaintenanceRoute } from './jobs-maintenance';
import type { MaintenanceRouteDeps } from '../maintenance';

function makeReqRes(
  method: string,
  url: string,
  body?: string
): { req: IncomingMessage; res: ServerResponse; sent: () => { status: number; body: string } } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  // Stream the body if provided.
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

function fakeDeps(triggerFn: MaintenanceRouteDeps['triggerFn']): MaintenanceRouteDeps {
  return {
    scheduler: { getStatus: () => ({ schedule: {} as never }) } as never,
    reporter: { getHistory: () => [] } as never,
    triggerFn,
  };
}

describe('POST /api/v1/jobs/maintenance', () => {
  it('returns 200 and runId on valid POST', async () => {
    const trigger = vi.fn().mockResolvedValue(undefined);
    const { req, res, sent } = makeReqRes(
      'POST',
      '/api/v1/jobs/maintenance',
      JSON.stringify({ taskId: 'cleanup-sessions' })
    );
    const handled = handleV1JobsMaintenanceRoute(req, res, fakeDeps(trigger));
    expect(handled).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    const { status, body } = sent();
    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { ok: boolean; taskId: string; runId: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.taskId).toBe('cleanup-sessions');
    expect(parsed.runId).toMatch(/^run_[a-f0-9]+$/);
    expect(trigger).toHaveBeenCalledWith('cleanup-sessions');
  });

  it('returns 400 on missing taskId', async () => {
    const { req, res, sent } = makeReqRes('POST', '/api/v1/jobs/maintenance', '{}');
    handleV1JobsMaintenanceRoute(req, res, fakeDeps(vi.fn()));
    await new Promise((r) => setTimeout(r, 10));
    expect(sent().status).toBe(400);
  });

  it('returns 404 when triggerFn throws "task not found"', async () => {
    const trigger = vi.fn().mockRejectedValue(new Error('task not found: bogus'));
    const { req, res, sent } = makeReqRes(
      'POST',
      '/api/v1/jobs/maintenance',
      JSON.stringify({ taskId: 'bogus' })
    );
    handleV1JobsMaintenanceRoute(req, res, fakeDeps(trigger));
    await new Promise((r) => setTimeout(r, 10));
    expect(sent().status).toBe(404);
  });

  it('returns 409 when triggerFn throws "already running"', async () => {
    const trigger = vi.fn().mockRejectedValue(new Error('task cleanup-sessions already running'));
    const { req, res, sent } = makeReqRes(
      'POST',
      '/api/v1/jobs/maintenance',
      JSON.stringify({ taskId: 'cleanup-sessions' })
    );
    handleV1JobsMaintenanceRoute(req, res, fakeDeps(trigger));
    await new Promise((r) => setTimeout(r, 10));
    expect(sent().status).toBe(409);
  });

  it('returns false (does not match) for non-/api/v1/jobs/maintenance paths', () => {
    const { req, res } = makeReqRes('POST', '/api/maintenance/trigger');
    const handled = handleV1JobsMaintenanceRoute(req, res, fakeDeps(vi.fn()));
    expect(handled).toBe(false);
  });
});
