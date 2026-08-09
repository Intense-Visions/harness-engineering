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
 * One prefix mapping, split by what the request does rather than only where it
 * points. The two other resolution layers — `V1_BRIDGE_ROUTES` and
 * `exactScopeForRoute` — have always pinned a method; this layer is the
 * catch-all and originally keyed on path alone, so a read scope on a prefix
 * silently authorized every mutating verb the handler underneath happened to
 * serve.
 */
export interface PrefixScopeEntry {
  readonly prefix: string;
  /** The safe, side-effect-free verbs: GET / HEAD / OPTIONS. */
  readonly read: TokenScope;
  /**
   * Every other verb. `null` means the prefix has no mutating surface, so a
   * mutating request default-denies (403) instead of inheriting the read scope.
   * Adding a mutating verb to such a handler stays denied until this entry is
   * updated deliberately.
   */
  readonly write: TokenScope | null;
}

/**
 * Verbs that route to `read`. Everything else — including verbs this codebase
 * does not serve today (MOVE, COPY, MKCOL, PROPPATCH, SEARCH, QUERY, …), which
 * Node's parser will happily accept and dispatch — routes to `write`.
 *
 * Deliberately an allow-list. A deny-list of the four common mutating verbs
 * would leave `write: null` enforced against only those four, so any verb
 * outside the list would silently inherit the read scope and defeat the
 * guarantee this entry shape exists to make.
 */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Prefix-based default mapping (Phase 1). Ordered first-match-wins; entries are
 * matched via startsWith except the exact `/api/chat` route, which must not also
 * match `/api/chat-proxy`'s startsWith.
 *
 * Scope choices are constrained by the pinned `SCOPE_VOCABULARY` above, so the
 * mutating entries reuse `trigger-job` — the existing "cause the orchestrator to
 * do operational work" scope already carried by `/api/maintenance` and
 * `/api/chat` — rather than minting a new scope, which would require an ADR and
 * a `TokenScopeSchema` change. `/api/plans` writes into the directory
 * `PlanWatcher` watches, so a plan write literally enqueues work; `/api/analyze`
 * runs the intelligence pipeline; session create/update/delete mutates
 * orchestrator state.
 *
 * Entries whose scope was already write-grade repeat it in both fields, so their
 * resolution is unchanged.
 */
export const PREFIX_SCOPES: ReadonlyArray<PrefixScopeEntry> = [
  { prefix: '/api/interactions', read: 'resolve-interaction', write: 'resolve-interaction' },
  { prefix: '/api/plans', read: 'read-status', write: 'trigger-job' },
  { prefix: '/api/analyze', read: 'read-status', write: 'trigger-job' },
  { prefix: '/api/analyses', read: 'read-status', write: null },
  { prefix: '/api/roadmap-actions', read: 'modify-roadmap', write: 'modify-roadmap' },
  { prefix: '/api/dispatch-actions', read: 'trigger-job', write: 'trigger-job' },
  // Longest-prefix-first: `/api/local-models` starts with `/api/local-model`, so
  // the singular entry would shadow the plural one under first-match-wins and
  // make it dead code. Both resolve identically today, but a future scope change
  // to one of them must actually take effect on the paths it names. The
  // no-shadowing invariant is pinned by a test.
  { prefix: '/api/local-models', read: 'read-status', write: null },
  { prefix: '/api/local-model', read: 'read-status', write: null },
  { prefix: '/api/maintenance', read: 'trigger-job', write: 'trigger-job' },
  { prefix: '/api/streams', read: 'read-status', write: null },
  { prefix: '/api/sessions', read: 'read-status', write: 'trigger-job' },
  { prefix: '/api/chat-proxy', read: 'trigger-job', write: 'trigger-job' },
];

/**
 * Resolve a scope from the ordered prefix mapping for a method + path; null when
 * nothing matches, or when the matched prefix exposes no mutating surface.
 */
function prefixScopeForRoute(method: string, path: string): TokenScope | null {
  // Exact `/api/chat` is not a prefix of any PREFIX_SCOPES entry, so checking it
  // first preserves the original first-match-wins ordering. It is a single
  // trigger-job route for every method, read and write alike.
  if (path === '/api/chat') return 'trigger-job';
  const mutating = !SAFE_METHODS.has(method.toUpperCase());
  for (const entry of PREFIX_SCOPES) {
    if (path.startsWith(entry.prefix)) return mutating ? entry.write : entry.read;
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

  return prefixScopeForRoute(method, path);
}
