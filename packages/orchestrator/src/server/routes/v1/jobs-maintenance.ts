import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { readBody } from '../../utils.js';
import type { MaintenanceRouteDeps } from '../maintenance';

const BodySchema = z.object({
  taskId: z.string().min(1).max(200),
  params: z.record(z.unknown()).optional(),
});

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * POST /api/v1/jobs/maintenance — Phase 2 bridge primitive.
 *
 * Wraps the existing MaintenanceRouteDeps.triggerFn injection so the legacy
 * /api/maintenance/trigger and the new v1 entry share a single execution path.
 * The legacy route already returns { ok, taskId }; v1 extends with a runId
 * for client correlation (Spec D1 — bridge primitives).
 *
 * Scope: trigger-job (enforced by dispatchAuthedRequest).
 *
 * Returns:
 *   200 { ok: true, taskId, runId }
 *   400 invalid body
 *   404 task not found
 *   409 task already running
 *   500 unexpected error
 */
export function handleV1JobsMaintenanceRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: MaintenanceRouteDeps | null
): boolean {
  if (req.url !== '/api/v1/jobs/maintenance' || req.method !== 'POST') return false;
  if (!deps) {
    sendJSON(res, 503, { error: 'Maintenance not available' });
    return true;
  }
  void (async () => {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch (err) {
      sendJSON(res, 413, { error: err instanceof Error ? err.message : 'Body too large' });
      return;
    }
    let json: unknown;
    try {
      // harness-ignore SEC-DES-001: input validated by Zod schema (BodySchema) below
      json = JSON.parse(raw);
    } catch {
      sendJSON(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      sendJSON(res, 400, { error: 'Invalid body', issues: parsed.error.issues });
      return;
    }
    const runId = `run_${randomBytes(8).toString('hex')}`;
    try {
      await deps.triggerFn(parsed.data.taskId);
      sendJSON(res, 200, { ok: true, taskId: parsed.data.taskId, runId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Trigger failed';
      const lower = msg.toLowerCase();
      // Orchestrator's triggerFn (orchestrator.ts:593) throws "Unknown task: <id>"
      // when the task ID is not registered. Match both that wording and the
      // generic "not found" form so callers consistently see 404 for missing tasks.
      if (lower.includes('unknown task') || lower.includes('not found')) {
        sendJSON(res, 404, { error: msg });
        return;
      }
      if (lower.includes('already running')) {
        sendJSON(res, 409, { error: msg });
        return;
      }
      sendJSON(res, 500, { error: 'Internal error triggering maintenance task' });
    }
  })();
  return true;
}
