import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  TokenScopeSchema,
  BridgeKindSchema,
  AuthTokenPublicSchema,
} from '@harness-engineering/types';
import type { TokenStore } from '../../auth/tokens';
import { readBody } from '../utils.js';

const CreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(TokenScopeSchema).min(1),
  bridgeKind: BridgeKindSchema.optional(),
  tenantId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
  store: TokenStore
): Promise<void> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to read body';
    sendJSON(res, 413, { error: msg });
    return;
  }
  let json: unknown;
  try {
    // harness-ignore SEC-DES-001: input validated by Zod schema (CreateBodySchema) immediately below
    json = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: 'Invalid JSON body' });
    return;
  }
  const parsed = CreateBodySchema.safeParse(json);
  if (!parsed.success) {
    sendJSON(res, 422, { error: 'Invalid body', issues: parsed.error.issues });
    return;
  }
  try {
    // Strip undefined fields so the strict CreateTokenInput accepts the payload.
    const input: Parameters<TokenStore['create']>[0] = {
      name: parsed.data.name,
      scopes: parsed.data.scopes,
    };
    if (parsed.data.bridgeKind !== undefined) input.bridgeKind = parsed.data.bridgeKind;
    if (parsed.data.tenantId !== undefined) input.tenantId = parsed.data.tenantId;
    if (parsed.data.expiresAt !== undefined) input.expiresAt = parsed.data.expiresAt;
    const result = await store.create(input);
    // Public-facing record: hashedSecret stripped via AuthTokenPublicSchema.
    // publicRecord.id === result.id; spreading the redacted record carries name,
    // scopes, createdAt, expiresAt, bridgeKind, tenantId without leaking hashedSecret.
    const publicRecord = AuthTokenPublicSchema.parse(result.record);
    sendJSON(res, 200, {
      ...publicRecord,
      token: result.token,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create token';
    if (msg.includes('already exists')) {
      sendJSON(res, 409, { error: msg });
      return;
    }
    // Mask internal error details — do not leak filesystem paths, bcrypt errors, etc.
    sendJSON(res, 500, { error: 'Internal error creating token' });
  }
}

async function handleList(res: ServerResponse, store: TokenStore): Promise<void> {
  try {
    const list = await store.list();
    sendJSON(res, 200, list);
  } catch {
    sendJSON(res, 500, { error: 'Internal error listing tokens' });
  }
}

async function handleDelete(res: ServerResponse, store: TokenStore, id: string): Promise<void> {
  try {
    const ok = await store.revoke(id);
    if (!ok) {
      sendJSON(res, 404, { error: 'Token not found' });
      return;
    }
    sendJSON(res, 200, { deleted: true });
  } catch {
    sendJSON(res, 500, { error: 'Internal error revoking token' });
  }
}

const DELETE_PATH_RE = /^\/api\/v1\/auth\/tokens\/([^/?]+)(?:\?.*)?$/;

/**
 * Handles Gateway API auth admin routes (Phase 1):
 *
 * - `POST   /api/v1/auth/token`        — Create a token. Secret returned once.
 *                                         Body: {name, scopes[], bridgeKind?, tenantId?, expiresAt?}
 * - `GET    /api/v1/auth/tokens`       — List tokens. hashedSecret redacted.
 * - `DELETE /api/v1/auth/tokens/{id}`  — Revoke a token. 404 if not found.
 *
 * Auth + scope gating is enforced by the OrchestratorServer dispatch loop
 * (`requiredScopeForRoute` maps each of these to `admin`). This handler runs
 * AFTER auth + scope checks have passed.
 *
 * Returns true if the route matched, false otherwise (so the caller can
 * continue trying other handlers in the route table).
 */
export function handleAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
  store: TokenStore
): boolean {
  const { method, url } = req;
  if (!url) return false;
  // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- URL path, not filesystem path
  if (!url.startsWith('/api/v1/auth/')) return false;

  const [pathname] = url.split('?');

  if (method === 'POST' && pathname === '/api/v1/auth/token') {
    void handlePost(req, res, store);
    return true;
  }
  if (method === 'GET' && pathname === '/api/v1/auth/tokens') {
    void handleList(res, store);
    return true;
  }
  if (method === 'DELETE') {
    const match = (pathname ?? '').match(DELETE_PATH_RE);
    if (match && match[1]) {
      const id = decodeURIComponent(match[1]);
      void handleDelete(res, store, id);
      return true;
    }
  }

  // Path is under /api/v1/auth/ but method/sub-path doesn't match any handler.
  // Return 405 so the audit log captures the rejection — the scope gate already
  // permitted the caller, so a 404 here would conflate "no such route" with
  // "no such resource".
  sendJSON(res, 405, { error: 'Method not allowed' });
  return true;
}
