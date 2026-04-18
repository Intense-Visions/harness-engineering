import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MaintenanceScheduler } from '../../maintenance/scheduler';
import type { MaintenanceReporter } from '../../maintenance/reporter';
import { readBody } from '../utils.js';

/**
 * Dependencies injected into the maintenance route handler.
 */
export interface MaintenanceRouteDeps {
  scheduler: MaintenanceScheduler;
  reporter: MaintenanceReporter;
  triggerFn: (taskId: string) => Promise<void>;
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function handleGetSchedule(res: ServerResponse, deps: MaintenanceRouteDeps): void {
  const status = deps.scheduler.getStatus();
  sendJSON(res, 200, status.schedule);
}

function handleGetStatus(res: ServerResponse, deps: MaintenanceRouteDeps): void {
  const status = deps.scheduler.getStatus();
  sendJSON(res, 200, status);
}

function handleGetHistory(
  res: ServerResponse,
  deps: MaintenanceRouteDeps,
  queryString: string
): void {
  const params = new URLSearchParams(queryString);
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10) || 20));
  const offset = Math.max(0, parseInt(params.get('offset') ?? '0', 10) || 0);
  const history = deps.reporter.getHistory(limit, offset);
  sendJSON(res, 200, history);
}

function handlePostTrigger(
  req: IncomingMessage,
  res: ServerResponse,
  deps: MaintenanceRouteDeps
): void {
  void (async () => {
    try {
      const body = await readBody(req);
      let parsed: { taskId?: string };
      try {
        parsed = JSON.parse(body) as { taskId?: string };
      } catch {
        sendJSON(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      if (!parsed.taskId || typeof parsed.taskId !== 'string') {
        sendJSON(res, 400, { error: 'Missing taskId string' });
        return;
      }

      await deps.triggerFn(parsed.taskId);
      sendJSON(res, 200, { ok: true, taskId: parsed.taskId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Trigger failed';
      if (!res.headersSent) {
        sendJSON(res, 500, { error: msg });
      }
    }
  })();
}

/**
 * Handles maintenance dashboard API routes.
 *
 * - GET  /api/maintenance/schedule  — next-run times per task
 * - GET  /api/maintenance/status    — full MaintenanceStatus
 * - GET  /api/maintenance/history   — paginated RunResult[] (?limit=20&offset=0)
 * - POST /api/maintenance/trigger   — enqueue a task for immediate execution
 *
 * Returns true if the route matched, false otherwise.
 */
export function handleMaintenanceRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: MaintenanceRouteDeps | null
): boolean {
  const { method, url } = req;
  // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- URL path, not filesystem
  if (!url?.startsWith('/api/maintenance/')) return false;
  if (!deps) {
    sendJSON(res, 503, { error: 'Maintenance not available' });
    return true;
  }

  const [pathname, queryString] = url.split('?');

  if (method === 'GET') {
    switch (pathname) {
      case '/api/maintenance/schedule':
        handleGetSchedule(res, deps);
        return true;
      case '/api/maintenance/status':
        handleGetStatus(res, deps);
        return true;
      case '/api/maintenance/history':
        handleGetHistory(res, deps, queryString ?? '');
        return true;
    }
  }

  if (method === 'POST' && pathname === '/api/maintenance/trigger') {
    handlePostTrigger(req, res, deps);
    return true;
  }

  sendJSON(res, 404, { error: 'Not found' });
  return true;
}
