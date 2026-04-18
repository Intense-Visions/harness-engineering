import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMaintenanceRoute } from '../../src/server/routes/maintenance';
import type { MaintenanceRouteDeps } from '../../src/server/routes/maintenance';
import type { MaintenanceStatus, RunResult } from '../../src/maintenance/types';

/** Minimal mock IncomingMessage with method, url, and event emitter for body. */
function mockReq(method: string, url: string, body?: string): IncomingMessage {
  const emitter = new EventEmitter() as IncomingMessage & EventEmitter;
  (emitter as unknown as Record<string, unknown>).method = method;
  (emitter as unknown as Record<string, unknown>).url = url;
  // Simulate body delivery after a microtask
  if (body !== undefined) {
    queueMicrotask(() => {
      emitter.emit('data', Buffer.from(body));
      emitter.emit('end');
    });
  }
  return emitter;
}

/** Captures writeHead status and end body. */
function mockRes(): ServerResponse & {
  _status: number;
  _body: string;
  _headers: Record<string, string>;
} {
  const res = {
    _status: 0,
    _body: '',
    _headers: {} as Record<string, string>,
    headersSent: false,
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) Object.assign(res._headers, headers);
      return res;
    },
    end(body?: string) {
      res._body = body ?? '';
      res.headersSent = true;
    },
  } as unknown as ServerResponse & {
    _status: number;
    _body: string;
    _headers: Record<string, string>;
  };
  return res;
}

const mockStatus: MaintenanceStatus = {
  isLeader: true,
  lastLeaderClaim: '2026-01-01T00:00:00.000Z',
  schedule: [
    {
      taskId: 'arch-violations',
      nextRun: '2026-01-01T02:00:00.000Z',
      lastRun: null,
    },
  ],
  activeRun: null,
  history: [],
};

const mockHistory: RunResult[] = [
  {
    taskId: 'arch-violations',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:01:00.000Z',
    status: 'success',
    findings: 3,
    fixed: 3,
    prUrl: null,
    prUpdated: false,
  },
];

function createMockDeps(): MaintenanceRouteDeps {
  return {
    scheduler: {
      getStatus: vi.fn().mockReturnValue(mockStatus),
    } as unknown as MaintenanceRouteDeps['scheduler'],
    reporter: {
      getHistory: vi.fn().mockReturnValue(mockHistory),
    } as unknown as MaintenanceRouteDeps['reporter'],
    triggerFn: vi.fn().mockResolvedValue(undefined),
  };
}

describe('handleMaintenanceRoute', () => {
  let deps: MaintenanceRouteDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('returns false for non-matching URLs', () => {
    const req = mockReq('GET', '/api/state');
    const res = mockRes();
    expect(handleMaintenanceRoute(req, res, deps)).toBe(false);
  });

  it('returns 503 when deps is null', () => {
    const req = mockReq('GET', '/api/maintenance/status');
    const res = mockRes();
    expect(handleMaintenanceRoute(req, res, null)).toBe(true);
    expect(res._status).toBe(503);
  });

  describe('GET /api/maintenance/schedule', () => {
    it('returns the schedule array from scheduler status', () => {
      const req = mockReq('GET', '/api/maintenance/schedule');
      const res = mockRes();
      expect(handleMaintenanceRoute(req, res, deps)).toBe(true);
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body).toEqual(mockStatus.schedule);
    });
  });

  describe('GET /api/maintenance/status', () => {
    it('returns full MaintenanceStatus', () => {
      const req = mockReq('GET', '/api/maintenance/status');
      const res = mockRes();
      expect(handleMaintenanceRoute(req, res, deps)).toBe(true);
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body).toEqual(mockStatus);
    });
  });

  describe('GET /api/maintenance/history', () => {
    it('passes default pagination params', () => {
      const req = mockReq('GET', '/api/maintenance/history');
      const res = mockRes();
      handleMaintenanceRoute(req, res, deps);
      expect(deps.reporter.getHistory).toHaveBeenCalledWith(20, 0);
    });

    it('passes custom limit and offset from query params', () => {
      const req = mockReq('GET', '/api/maintenance/history?limit=5&offset=10');
      const res = mockRes();
      handleMaintenanceRoute(req, res, deps);
      expect(deps.reporter.getHistory).toHaveBeenCalledWith(5, 10);
    });

    it('clamps limit to 100 when exceeding maximum', () => {
      const req = mockReq('GET', '/api/maintenance/history?limit=200');
      const res = mockRes();
      handleMaintenanceRoute(req, res, deps);
      expect(deps.reporter.getHistory).toHaveBeenCalledWith(100, 0);
    });

    it('falls back to default limit when limit=0 (falsy)', () => {
      const req = mockReq('GET', '/api/maintenance/history?limit=0');
      const res = mockRes();
      handleMaintenanceRoute(req, res, deps);
      // parseInt('0') is 0 (falsy), so || 20 fallback applies, then Math.max(1, 20) = 20
      expect(deps.reporter.getHistory).toHaveBeenCalledWith(20, 0);
    });

    it('returns the history array', () => {
      const req = mockReq('GET', '/api/maintenance/history');
      const res = mockRes();
      handleMaintenanceRoute(req, res, deps);
      expect(res._status).toBe(200);
      expect(JSON.parse(res._body)).toEqual(mockHistory);
    });
  });

  describe('POST /api/maintenance/trigger', () => {
    it('triggers with valid taskId', async () => {
      const req = mockReq('POST', '/api/maintenance/trigger', '{"taskId":"arch-violations"}');
      const res = mockRes();
      handleMaintenanceRoute(req, res, deps);
      // Wait for async handler
      await vi.waitFor(() => expect(res._status).toBe(200));
      expect(deps.triggerFn).toHaveBeenCalledWith('arch-violations');
      expect(JSON.parse(res._body)).toEqual({ ok: true, taskId: 'arch-violations' });
    });

    it('returns 400 for missing taskId', async () => {
      const req = mockReq('POST', '/api/maintenance/trigger', '{}');
      const res = mockRes();
      handleMaintenanceRoute(req, res, deps);
      await vi.waitFor(() => expect(res._status).toBe(400));
      expect(JSON.parse(res._body)).toEqual({ error: 'Missing taskId string' });
    });

    it('returns 500 when triggerFn throws', async () => {
      (deps.triggerFn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
      const req = mockReq('POST', '/api/maintenance/trigger', '{"taskId":"x"}');
      const res = mockRes();
      handleMaintenanceRoute(req, res, deps);
      await vi.waitFor(() => expect(res._status).toBe(500));
      expect(JSON.parse(res._body)).toEqual({ error: 'boom' });
    });

    it('returns 400 for malformed JSON body', async () => {
      const req = mockReq('POST', '/api/maintenance/trigger', 'not-json{{{');
      const res = mockRes();
      handleMaintenanceRoute(req, res, deps);
      await vi.waitFor(() => expect(res._status).toBe(400));
      expect(JSON.parse(res._body)).toEqual({ error: 'Invalid JSON body' });
    });
  });

  it('returns 404 for unknown maintenance sub-routes', () => {
    const req = mockReq('GET', '/api/maintenance/unknown');
    const res = mockRes();
    expect(handleMaintenanceRoute(req, res, deps)).toBe(true);
    expect(res._status).toBe(404);
  });
});
