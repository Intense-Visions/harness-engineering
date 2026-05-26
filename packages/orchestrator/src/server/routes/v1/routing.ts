import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BackendDef, RoutingConfig, RoutingValue } from '@harness-engineering/types';
import type { BackendRouter } from '../../../agent/backend-router';
import { toArray } from '../../../agent/backend-router';
import type { RoutingDecisionBus } from '../../../routing/decision-bus';

const CONFIG_RE = /^\/api\/v1\/routing\/config(?:\?.*)?$/;
const DECISIONS_RE = /^\/api\/v1\/routing\/decisions(?:\?.*)?$/;
const TRACE_RE = /^\/api\/v1\/routing\/trace(?:\?.*)?$/;

/**
 * Spec B Phase 5 — routing observability route dependencies.
 *
 * `router` is the live, bus-injected production router (used by future
 * routes that need to introspect live state). `bus` is the same instance
 * the dispatch path emits onto. `routing` + `backends` are config
 * snapshots used by the config route (resolved chains) AND by the trace
 * route to construct a sibling bus-less router so dry-runs cannot
 * pollute the production ring buffer.
 */
export interface RoutingRouteDeps {
  router: BackendRouter | null;
  bus: RoutingDecisionBus | null;
  routing: RoutingConfig | null;
  backends: Record<string, BackendDef> | null;
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function unavailable(res: ServerResponse): true {
  sendJSON(res, 503, { error: 'BackendRouter not available' });
  return true;
}

function resolveChain(
  value: RoutingValue,
  backends: Record<string, BackendDef>
): { candidate: string; exists: boolean }[] {
  return toArray(value).map((c) => ({ candidate: c, exists: c in backends }));
}

/**
 * Build the flat-keyed `resolvedChains` map (D-OP-5). Keys are
 * `<source>:<key>` so the dashboard can render one row per source without
 * re-walking RoutingConfig client-side. The `default` key is unprefixed.
 */
function buildResolvedChains(
  routing: RoutingConfig,
  backends: Record<string, BackendDef>
): Record<string, { candidate: string; exists: boolean }[]> {
  const out: Record<string, { candidate: string; exists: boolean }[]> = {};
  out['default'] = resolveChain(routing.default, backends);
  for (const tier of ['quick-fix', 'guided-change', 'full-exploration', 'diagnostic'] as const) {
    const v = (routing as unknown as Record<string, RoutingValue | undefined>)[tier];
    if (v !== undefined) out[`tier:${tier}`] = resolveChain(v, backends);
  }
  if (routing.intelligence) {
    for (const [layer, v] of Object.entries(routing.intelligence)) {
      if (v !== undefined) out[`intelligence:${layer}`] = resolveChain(v, backends);
    }
  }
  if (routing.isolation) {
    for (const [tier, v] of Object.entries(routing.isolation)) {
      if (v !== undefined) out[`isolation:${tier}`] = resolveChain(v, backends);
    }
  }
  if (routing.skills) {
    for (const [name, v] of Object.entries(routing.skills)) {
      if (v !== undefined) out[`skill:${name}`] = resolveChain(v, backends);
    }
  }
  if (routing.modes) {
    for (const [mode, v] of Object.entries(routing.modes)) {
      if (v !== undefined) out[`mode:${mode}`] = resolveChain(v, backends);
    }
  }
  return out;
}

function handleConfig(res: ServerResponse, deps: RoutingRouteDeps): boolean {
  if (!deps.router || !deps.routing || !deps.backends) return unavailable(res);
  sendJSON(res, 200, {
    routing: deps.routing,
    resolvedChains: buildResolvedChains(deps.routing, deps.backends),
    backends: Object.keys(deps.backends),
  });
  return true;
}

/**
 * Spec B Phase 5 dispatcher: GET /api/v1/routing/config, GET
 * /api/v1/routing/decisions, POST /api/v1/routing/trace. Returns true
 * when the route matched (response was written) and false to let the
 * caller fall through to the next handler in the table.
 */
export function handleV1RoutingRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RoutingRouteDeps
): boolean {
  const url = req.url ?? '';
  const method = req.method ?? 'GET';
  if (method === 'GET' && CONFIG_RE.test(url)) return handleConfig(res, deps);
  // DECISIONS_RE + TRACE_RE wired in Tasks 6/8
  void DECISIONS_RE;
  void TRACE_RE;
  return false;
}
