import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { Issue } from '@harness-engineering/types';
import { handleDispatchActionsRoute } from './dispatch-actions';

const ROUTE = '/api/dispatch/adhoc';
// Fixed instant so `new Date().toISOString()` inside the handler is deterministic.
const FIXED_NOW = '2026-07-20T12:34:56.000Z';

/**
 * Build a minimal IncomingMessage-like object. Readable.from buffers the body
 * in paused mode until readBody() attaches its 'data' listener, so there is no
 * lost-event race regardless of when the handler starts consuming.
 */
function makeReq(method: string, url: string, body = ''): IncomingMessage {
  const req = Readable.from(body.length ? [body] : []) as unknown as IncomingMessage;
  (req as unknown as { method: string }).method = method;
  (req as unknown as { url: string }).url = url;
  return req;
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  headersSent: boolean;
  writeHead(status: number, headers: Record<string, string>): MockRes;
  end(chunk?: unknown): void;
  /** Resolves once end() is invoked, i.e. the handler's async work finished. */
  done: Promise<void>;
  json<T>(): T;
}

function makeRes(): MockRes {
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const res: MockRes = {
    statusCode: 0,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
      this.headersSent = true;
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === 'string') this.body = chunk;
      resolveDone();
    },
    done,
    json<T>() {
      return JSON.parse(this.body) as T;
    },
  };
  return res;
}

/** Invoke the route handler and wait for its fire-and-forget async work. */
async function invoke(
  method: string,
  url: string,
  body: string,
  dispatchFn: Parameters<typeof handleDispatchActionsRoute>[2]
): Promise<{ matched: boolean; res: MockRes }> {
  const req = makeReq(method, url, body);
  const res = makeRes();
  const matched = handleDispatchActionsRoute(req, res as unknown as ServerResponse, dispatchFn);
  if (matched) await res.done;
  return { matched, res };
}

describe('handleDispatchActionsRoute (POST /api/dispatch/adhoc)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('route matching', () => {
    it('returns false and never invokes dispatch for a non-POST method', () => {
      const dispatchFn = vi.fn().mockResolvedValue(undefined);
      const req = makeReq('GET', ROUTE);
      const res = makeRes();

      const matched = handleDispatchActionsRoute(req, res as unknown as ServerResponse, dispatchFn);

      expect(matched).toBe(false);
      expect(dispatchFn).not.toHaveBeenCalled();
    });

    it('returns false and never invokes dispatch for a different URL', () => {
      const dispatchFn = vi.fn().mockResolvedValue(undefined);
      const req = makeReq('POST', '/api/dispatch/other');
      const res = makeRes();

      const matched = handleDispatchActionsRoute(req, res as unknown as ServerResponse, dispatchFn);

      expect(matched).toBe(false);
      expect(dispatchFn).not.toHaveBeenCalled();
    });

    it('returns true (claims the route) even when the body is invalid', async () => {
      const dispatchFn = vi.fn().mockResolvedValue(undefined);
      const { matched } = await invoke('POST', ROUTE, JSON.stringify({}), dispatchFn);
      expect(matched).toBe(true);
    });
  });

  describe('dispatch availability', () => {
    it('returns 503 when no dispatch callback is injected', async () => {
      const { res } = await invoke('POST', ROUTE, JSON.stringify({ title: 'anything' }), null);

      expect(res.statusCode).toBe(503);
      expect(res.json<{ error: string }>().error).toMatch(/not available/i);
    });
  });

  describe('happy path', () => {
    it('builds a well-formed synthetic Issue and passes it to the dispatch callback', async () => {
      let captured: Issue | undefined;
      const dispatchFn = vi.fn(async (issue: Issue) => {
        captured = issue;
      });

      const { res } = await invoke(
        'POST',
        ROUTE,
        JSON.stringify({
          title: 'Fix login bug',
          description: 'users cannot sign in',
          labels: ['bug', 'auth'],
        }),
        dispatchFn
      );

      expect(res.statusCode).toBe(200);
      expect(dispatchFn).toHaveBeenCalledTimes(1);

      const issue = captured as Issue;
      // id is a sanitized-title + 8 hex chars of a sha256 hash.
      expect(issue.id).toMatch(/^fix-login-bug-[0-9a-f]{8}$/);
      expect(issue.identifier).toBe(issue.id);
      expect(issue.title).toBe('Fix login bug');
      expect(issue.description).toBe('users cannot sign in');
      expect(issue.labels).toEqual(['bug', 'auth']);
      expect(issue.state).toBe('planned');
      expect(issue.priority).toBeNull();
      expect(issue.branchName).toBeNull();
      expect(issue.url).toBeNull();
      expect(issue.spec).toBeNull();
      expect(issue.externalId).toBeNull();
      expect(issue.blockedBy).toEqual([]);
      expect(issue.plans).toEqual([]);
      // Timestamps derive from the (faked) system clock.
      expect(issue.createdAt).toBe(FIXED_NOW);
      expect(issue.updatedAt).toBe(FIXED_NOW);

      // Response echoes the same id used for the dispatched issue.
      const payload = res.json<{ ok: boolean; issueId: string }>();
      expect(payload.ok).toBe(true);
      expect(payload.issueId).toBe(issue.id);
    });

    it('defaults description to null and labels to an empty array when omitted', async () => {
      let captured: Issue | undefined;
      const dispatchFn = vi.fn(async (issue: Issue) => {
        captured = issue;
      });

      const { res } = await invoke(
        'POST',
        ROUTE,
        JSON.stringify({ title: 'No optionals here' }),
        dispatchFn
      );

      expect(res.statusCode).toBe(200);
      const issue = captured as Issue;
      expect(issue.description).toBeNull();
      expect(issue.labels).toEqual([]);
    });

    it('derives a stable, deterministic id from the same title', async () => {
      const first = vi.fn().mockResolvedValue(undefined);
      const second = vi.fn().mockResolvedValue(undefined);
      const title = 'Repeatable Title';

      const a = await invoke('POST', ROUTE, JSON.stringify({ title }), first);
      const b = await invoke('POST', ROUTE, JSON.stringify({ title }), second);

      const idA = a.res.json<{ issueId: string }>().issueId;
      const idB = b.res.json<{ issueId: string }>().issueId;
      expect(idA).toBe(idB);
    });
  });

  describe('validation failures', () => {
    it('returns 400 without dispatching when the title is missing', async () => {
      const dispatchFn = vi.fn().mockResolvedValue(undefined);
      const { res } = await invoke('POST', ROUTE, JSON.stringify({ description: 'x' }), dispatchFn);

      expect(res.statusCode).toBe(400);
      expect(dispatchFn).not.toHaveBeenCalled();
      expect(res.json<{ error: string }>().error).toBeTruthy();
    });

    it('returns 400 without dispatching when the title is an empty string', async () => {
      const dispatchFn = vi.fn().mockResolvedValue(undefined);
      const { res } = await invoke('POST', ROUTE, JSON.stringify({ title: '' }), dispatchFn);

      expect(res.statusCode).toBe(400);
      expect(dispatchFn).not.toHaveBeenCalled();
    });

    it('returns 500 (not 400) on malformed JSON, since JSON.parse throws before Zod runs', async () => {
      const dispatchFn = vi.fn().mockResolvedValue(undefined);
      const { res } = await invoke('POST', ROUTE, '{ not valid json', dispatchFn);

      expect(res.statusCode).toBe(500);
      expect(dispatchFn).not.toHaveBeenCalled();
      expect(res.json<{ error: string }>().error).toBeTruthy();
    });
  });

  describe('dispatch failure', () => {
    it('returns 500 with the error message when the dispatch callback rejects', async () => {
      const dispatchFn = vi.fn().mockRejectedValue(new Error('agent pool exhausted'));
      const { res } = await invoke(
        'POST',
        ROUTE,
        JSON.stringify({ title: 'Kick off work' }),
        dispatchFn
      );

      expect(dispatchFn).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(500);
      expect(res.json<{ error: string }>().error).toBe('agent pool exhausted');
    });
  });
});
