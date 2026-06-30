import type { TokenScope } from '@harness-engineering/types';
import { requiredBridgeScope } from '../server/v1-bridge-routes';

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
  // Hermes Phase 4 — list / approve / reject / edit skill proposals.
  // Reads (list, get) fall under `read-status`; only mutations require this.
  'manage-proposals',
] as const;

/** Returns true if `held` contains `required`, or includes 'admin'. */
export function hasScope(held: TokenScope[], required: TokenScope): boolean {
  if (held.includes('admin')) return true;
  return held.includes(required);
}

/**
 * Method-specific exact-match routes (auth admin + state endpoint). Returns null
 * when the method/path pair does not match one of these explicit routes.
 */
function exactScopeForRoute(method: string, path: string): TokenScope | null {
  // Auth admin routes
  if (path === '/api/v1/auth/token' && method === 'POST') return 'admin';
  if (path === '/api/v1/auth/tokens' && method === 'GET') return 'admin';
  if (/^\/api\/v1\/auth\/tokens\/[^/]+$/.test(path) && method === 'DELETE') return 'admin';

  // State endpoint (legacy + v1)
  if ((path === '/api/state' || path === '/api/v1/state') && method === 'GET') return 'read-status';

  return null;
}

/**
 * Prefix-based default mapping (Phase 1). Ordered first-match-wins; entries are
 * matched via startsWith except the exact `/api/chat` route, which must not also
 * match `/api/chat-proxy`'s startsWith.
 */
const PREFIX_SCOPES: ReadonlyArray<readonly [string, TokenScope]> = [
  ['/api/interactions', 'resolve-interaction'],
  ['/api/plans', 'read-status'],
  ['/api/analyze', 'read-status'],
  ['/api/analyses', 'read-status'],
  ['/api/roadmap-actions', 'modify-roadmap'],
  ['/api/dispatch-actions', 'trigger-job'],
  ['/api/local-model', 'read-status'],
  ['/api/local-models', 'read-status'],
  ['/api/maintenance', 'trigger-job'],
  ['/api/streams', 'read-status'],
  ['/api/sessions', 'read-status'],
  ['/api/chat-proxy', 'trigger-job'],
];

/** Resolve a scope from the ordered prefix mapping; null when nothing matches. */
function prefixScopeForPath(path: string): TokenScope | null {
  // Exact `/api/chat` is not a prefix of any PREFIX_SCOPES entry, so checking it
  // first preserves the original first-match-wins ordering.
  if (path === '/api/chat') return 'trigger-job';
  for (const [prefix, scope] of PREFIX_SCOPES) {
    if (path.startsWith(prefix)) return scope;
  }
  return null;
}

/**
 * Resolve the scope required for a given method + path. Returns null for
 * unknown routes — callers MUST default-deny (return 403) on null.
 *
 * Phase 2 covers /api/v1/* aliases (via URL rewrite in dispatch) + the three
 * bridge primitives below.
 */
export function requiredScopeForRoute(method: string, path: string): TokenScope | null {
  // Phase 3 Task 2: bridge primitives live in the shared V1_BRIDGE_ROUTES registry.
  const bridgeScope = requiredBridgeScope(method, path);
  if (bridgeScope) return bridgeScope;

  const exactScope = exactScopeForRoute(method, path);
  if (exactScope) return exactScope;

  return prefixScopeForPath(path);
}
