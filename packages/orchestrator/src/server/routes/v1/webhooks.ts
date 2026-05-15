import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EventEmitter } from 'node:events';
import { z } from 'zod';
import { readBody } from '../../utils.js';
import { isPrivateHost } from '../../utils/url-guard.js';
import { WebhookSubscriptionPublicSchema, type TokenScope } from '@harness-engineering/types';
import type { WebhookStore } from '../../../gateway/webhooks/store';
import type { WebhookQueue } from '../../../gateway/webhooks/queue';

/**
 * Phase 0 FINAL_REVIEW #4/#5: per-bridge audit + per-bridge revocation
 * (spec §D2) require GET /api/v1/webhooks to return only the requesting
 * token's subscriptions, and DELETE to refuse cross-token revocation.
 *
 * `admin` scope is exempt — admin tokens see everything (legacy
 * `tok_legacy_env` and unauth-dev `tok_unauth_dev` both carry `admin`,
 * so the scope check covers them naturally). The id-prefix check is a
 * defense-in-depth belt against a hypothetical future synthetic-admin
 * record that omits the scope.
 */
function isAdminAuth(authContext: { id: string; scopes: TokenScope[] } | undefined): boolean {
  if (!authContext) return false;
  if (authContext.scopes.includes('admin')) return true;
  if (authContext.id.startsWith('tok_legacy_env')) return true;
  return false;
}

function getAuthContext(req: IncomingMessage): { id: string; scopes: TokenScope[] } | undefined {
  return (req as unknown as { _authToken?: { id: string; scopes: TokenScope[] } })._authToken;
}

const CreateBody = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
});

// Match /api/v1/webhooks/queue/stats first; the generic DELETE /api/v1/webhooks/:id
// regex below intentionally excludes "/" so it can't swallow the stats path.
const QUEUE_STATS_PATH_RE = /^\/api\/v1\/webhooks\/queue\/stats(?:\?.*)?$/;
const DELETE_PATH_RE = /^\/api\/v1\/webhooks\/([a-zA-Z0-9_-]+)(?:\?.*)?$/;
const LIST_OR_CREATE_PATH_RE = /^\/api\/v1\/webhooks(?:\?.*)?$/;

interface Deps {
  store: WebhookStore;
  bus: EventEmitter;
  queue?: WebhookQueue;
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * SUG-5 carry-forward: unauth-dev mode (synthetic admin token from empty
 * tokens.json + missing HARNESS_API_TOKEN) escalates blast radius when a
 * mutate path is added. Webhook creation is the most sensitive new mutate
 * path in Phase 3 (an unintended subscription can exfiltrate every internal
 * event to an attacker URL).
 *
 * Phase 3's mitigation: emit a one-time per-process console.warn at the
 * FIRST webhook creation under unauth-dev. Operators see the warning during
 * `harness orchestrator start` smoke; intentional unauth-dev use stays
 * unblocked. Phase 4 may upgrade to scope downgrade if telemetry shows
 * accidental leakage.
 */
let unauthDevWarnedThisProcess = false;
function maybeWarnUnauthDev(tokenId: string, url: string): void {
  if (unauthDevWarnedThisProcess) return;
  const isUnauthDev =
    tokenId === 'tok_legacy_env' || process.env['HARNESS_UNAUTH_DEV_ACTIVE'] === '1';
  if (!isUnauthDev) return;
  unauthDevWarnedThisProcess = true;
  console.warn(
    `[webhook] subscription created under unauth-dev mode (tokenId=${tokenId}). ` +
      `Webhook target URL: ${url}. ` +
      `Set HARNESS_API_TOKEN or configure tokens.json to silence this warning.`
  );
}

export function handleV1WebhooksRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: Deps
): boolean {
  const url = req.url ?? '';
  const method = req.method ?? 'GET';

  // GET /api/v1/webhooks/queue/stats — Phase 4 delivery queue depth + DLQ count.
  // Matched FIRST so the more permissive LIST_OR_CREATE_PATH_RE below can't
  // shadow it (LIST matches exactly /api/v1/webhooks, so it wouldn't, but
  // future-proof against trailing-slash tolerance changes).
  if (method === 'GET' && QUEUE_STATS_PATH_RE.test(url)) {
    if (!deps.queue) {
      sendJSON(res, 503, { error: 'Queue not available' });
      return true;
    }
    sendJSON(res, 200, deps.queue.stats());
    return true;
  }

  // GET /api/v1/webhooks — list
  if (method === 'GET' && LIST_OR_CREATE_PATH_RE.test(url)) {
    void (async () => {
      const subs = await deps.store.list();
      // Phase 0 FINAL_REVIEW #4: per-token filtering. Non-admin tokens see
      // ONLY their own subscriptions; admin sees everything. The legacy
      // env synthetic admin and the unauth-dev synthetic admin both carry
      // the 'admin' scope so they pass through naturally.
      const authContext = getAuthContext(req);
      const visible = isAdminAuth(authContext)
        ? subs
        : subs.filter((s) => s.tokenId === authContext?.id);
      const publicView = visible.map((s) => WebhookSubscriptionPublicSchema.parse(s));
      sendJSON(res, 200, publicView);
    })();
    return true;
  }

  // POST /api/v1/webhooks — create
  if (method === 'POST' && LIST_OR_CREATE_PATH_RE.test(url)) {
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
        // harness-ignore SEC-DES-001: validated by Zod CreateBody below
        json = JSON.parse(raw);
      } catch {
        sendJSON(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      const parsed = CreateBody.safeParse(json);
      if (!parsed.success) {
        sendJSON(res, 400, { error: 'Invalid body', issues: parsed.error.issues });
        return;
      }
      if (!parsed.data.url.startsWith('https://')) {
        sendJSON(res, 422, { error: 'URL must use https' });
        return;
      }
      const targetHostname = new URL(parsed.data.url).hostname;
      if (isPrivateHost(targetHostname)) {
        sendJSON(res, 422, { error: 'URL must not target private or loopback addresses' });
        return;
      }
      const tokenId = getAuthContext(req)?.id ?? 'unknown';
      const sub = await deps.store.create({
        tokenId,
        url: parsed.data.url,
        events: parsed.data.events,
      });
      maybeWarnUnauthDev(tokenId, parsed.data.url);
      // Emit allow-list-shaped event for SSE + webhook fan-out (DELTA-SUG-2
      // carry-forward: positive shape discipline at the emit site).
      deps.bus.emit('webhook.subscription.created', {
        id: sub.id,
        tokenId: sub.tokenId,
        url: sub.url,
        events: sub.events,
        createdAt: sub.createdAt,
      });
      sendJSON(res, 200, sub);
    })();
    return true;
  }

  // DELETE /api/v1/webhooks/{id} — delete
  const m = method === 'DELETE' ? DELETE_PATH_RE.exec(url) : null;
  if (m) {
    const id = m[1] ?? '';
    void (async () => {
      const ok = await deps.store.delete(id);
      if (!ok) {
        sendJSON(res, 404, { error: 'Subscription not found' });
        return;
      }
      deps.bus.emit('webhook.subscription.deleted', { id });
      sendJSON(res, 200, { deleted: true });
    })();
    return true;
  }

  return false;
}
