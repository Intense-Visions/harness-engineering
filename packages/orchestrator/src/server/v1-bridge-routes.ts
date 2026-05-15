import type { TokenScope } from '@harness-engineering/types';

/**
 * Phase 3 (DELTA-SUG-1 carry-forward): single source of truth for v1-only
 * bridge primitives. Consumed by:
 *   - http.ts:dispatchAuthedRequest (skips URL rewrite for these paths)
 *   - scopes.ts:requiredScopeForRoute (returns required scope on match)
 *
 * Adding a new bridge primitive is a one-line append here — both call
 * sites pick it up. Previously this knowledge was duplicated across
 * http.ts (v1BridgePaths array) and scopes.ts (parallel inline branches),
 * which led to the CRIT-1 class of bug in Phase 2 review-cycle 1.
 */
export interface V1BridgeRoute {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
  /** Anchored regex; tolerates optional query string. Phase 4 may add trailing-slash tolerance per DELTA-SUG-3. */
  pattern: RegExp;
  scope: TokenScope;
  description: string;
}

export const V1_BRIDGE_ROUTES: ReadonlyArray<V1BridgeRoute> = [
  // ── Phase 2 bridge primitives ──
  {
    method: 'POST',
    pattern: /^\/api\/v1\/jobs\/maintenance(?:\?.*)?$/,
    scope: 'trigger-job',
    description: 'Trigger a maintenance task ad-hoc.',
  },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/interactions\/[^/]+\/resolve(?:\?.*)?$/,
    scope: 'resolve-interaction',
    description: 'Resolve a pending interaction.',
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/events(?:\?.*)?$/,
    scope: 'read-telemetry',
    description: 'Server-Sent Events stream.',
  },
  // ── Phase 3 bridge primitives ──
  {
    method: 'POST',
    pattern: /^\/api\/v1\/webhooks(?:\?.*)?$/,
    scope: 'subscribe-webhook',
    description: 'Subscribe to outbound webhook fan-out.',
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/v1\/webhooks\/[^/]+(?:\?.*)?$/,
    scope: 'subscribe-webhook',
    description: 'Delete a webhook subscription.',
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/webhooks(?:\?.*)?$/,
    scope: 'subscribe-webhook',
    description: 'List webhook subscriptions.',
  },
  // ── Phase 4 bridge primitives ──
  {
    method: 'GET',
    pattern: /^\/api\/v1\/webhooks\/queue\/stats(?:\?.*)?$/,
    scope: 'subscribe-webhook',
    description: 'Webhook delivery queue depth + DLQ stats.',
  },
  // ── Phase 5 bridge primitives ──
  {
    method: 'GET',
    pattern: /^\/api\/v1\/telemetry\/cache\/stats(?:\?.*)?$/,
    scope: 'read-telemetry',
    description: 'Prompt-cache hit/miss snapshot (rolling window).',
  },
];

export function isV1Bridge(method: string, url: string): boolean {
  return V1_BRIDGE_ROUTES.some((r) => r.method === method && r.pattern.test(url));
}

export function requiredBridgeScope(method: string, path: string): TokenScope | null {
  for (const r of V1_BRIDGE_ROUTES) {
    if (r.method === method && r.pattern.test(path)) return r.scope;
  }
  return null;
}
