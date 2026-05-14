/* eslint-disable @harness-engineering/no-hardcoded-path-separator -- file contains URL paths, not filesystem paths */
import type { TokenScope } from '@harness-engineering/types';

/**
 * Pinned scope vocabulary. Changes require an ADR per spec D2.
 * Mirror in @harness-engineering/types/src/auth.ts → TokenScopeSchema.
 */
export const SCOPE_VOCABULARY: readonly TokenScope[] = [
  'admin',
  'trigger-job',
  'read-status',
  'resolve-interaction',
  'subscribe-webhook',
  'modify-roadmap',
  'read-telemetry',
] as const;

/** Returns true if `held` contains `required`, or includes 'admin'. */
export function hasScope(held: TokenScope[], required: TokenScope): boolean {
  if (held.includes('admin')) return true;
  return held.includes(required);
}

/**
 * Resolve the scope required for a given method + path. Returns null for
 * unknown routes — callers MUST default-deny (return 403) on null.
 *
 * Phase 2 covers /api/v1/* aliases (via URL rewrite in dispatch) + the three
 * bridge primitives below.
 */
export function requiredScopeForRoute(method: string, path: string): TokenScope | null {
  // Auth admin routes
  if (path === '/api/v1/auth/token' && method === 'POST') return 'admin';
  if (path === '/api/v1/auth/tokens' && method === 'GET') return 'admin';
  if (/^\/api\/v1\/auth\/tokens\/[^/]+$/.test(path) && method === 'DELETE') return 'admin';

  // State endpoint (legacy + v1)
  if ((path === '/api/state' || path === '/api/v1/state') && method === 'GET') return 'read-status';

  // Phase 2 bridge-primitive endpoints (new in /api/v1/* only).
  if (path === '/api/v1/jobs/maintenance' && method === 'POST') return 'trigger-job';
  if (/^\/api\/v1\/interactions\/[^/]+\/resolve$/.test(path) && method === 'POST')
    return 'resolve-interaction';
  if (path === '/api/v1/events' && method === 'GET') return 'read-telemetry';

  // Existing routes — Phase 1 default mapping
  if (path.startsWith('/api/interactions')) return 'resolve-interaction';
  if (path.startsWith('/api/plans')) return 'read-status';
  if (path.startsWith('/api/analyze') || path.startsWith('/api/analyses')) return 'read-status';
  if (path.startsWith('/api/roadmap-actions')) return 'modify-roadmap';
  if (path.startsWith('/api/dispatch-actions')) return 'trigger-job';
  if (path.startsWith('/api/local-model') || path.startsWith('/api/local-models'))
    return 'read-status';
  if (path.startsWith('/api/maintenance')) return 'trigger-job';
  if (path.startsWith('/api/streams')) return 'read-status';
  if (path.startsWith('/api/sessions')) return 'read-status';
  if (path.startsWith('/api/chat-proxy')) return 'trigger-job';

  return null;
}
