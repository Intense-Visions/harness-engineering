import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import type { Issue } from '@harness-engineering/types';
import { readBody } from '../utils.js';

interface DispatchAdHocRequest {
  title: string;
  description?: string;
  labels?: string[];
}

/** Callback injected by the orchestrator to allow ad-hoc dispatch. */
export interface DispatchAdHocFn {
  (issue: Issue): Promise<void>;
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function generateId(name: string): string {
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 8);
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 20);
  return `${sanitized}-${hash}`;
}

/**
 * POST /api/dispatch/adhoc — Immediately dispatch a work item to an agent,
 * bypassing the normal roadmap → tick → dispatch cycle.
 * Returns `true` if the route matched, `false` otherwise.
 */
export function handleDispatchActionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  dispatchFn: DispatchAdHocFn | null
): boolean {
  if (req.method !== 'POST' || req.url !== '/api/dispatch/adhoc') return false;

  void (async () => {
    try {
      if (!dispatchFn) {
        sendJSON(res, 503, { error: 'Dispatch not available' });
        return;
      }

      const body = await readBody(req);
      const parsed = JSON.parse(body) as DispatchAdHocRequest;

      if (!parsed.title || typeof parsed.title !== 'string') {
        sendJSON(res, 400, { error: 'Missing title string' });
        return;
      }

      const id = generateId(parsed.title);
      const issue: Issue = {
        id,
        identifier: id,
        title: parsed.title,
        description: parsed.description ?? null,
        priority: null,
        state: 'planned',
        branchName: null,
        url: null,
        labels: parsed.labels ?? [],
        blockedBy: [],
        spec: null,
        plans: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        externalId: null,
      };

      await dispatchFn(issue);
      sendJSON(res, 200, { ok: true, issueId: id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dispatch failed';
      if (!res.headersSent) {
        sendJSON(res, 500, { error: msg });
      }
    }
  })();
  return true;
}
