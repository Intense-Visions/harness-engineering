import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  BackendDef,
  ComplexityLevel,
  ComplexityVerdict,
  RoutingConfig,
  RoutingRisk,
  RoutingUseCase,
  RoutingValue,
} from '@harness-engineering/types';
import { z } from 'zod';
import { deriveRequiredTier } from '@harness-engineering/intelligence';
import { BackendRouter, toArray } from '../../../agent/backend-router';
import { estimateCost } from '../../../agent/cost-estimator';
import type { RoutingDecisionBus } from '../../../routing/decision-bus';
import { readBody } from '../../utils';

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
 * Spec B Phase 5 (F8): parse the decisions query string into the bus's
 * filter shape. Supports `skill`, `mode`, `backend`, `limit`; all
 * optional and AND-combined. `limit` is coerced to a positive integer;
 * non-numeric / non-positive values are silently dropped so the bus
 * returns its default-bounded result.
 */
function parseDecisionsQuery(url: string): {
  skillName?: string;
  mode?: string;
  backendName?: string;
  limit?: number;
} {
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return {};
  const p = new URLSearchParams(url.slice(qIdx + 1));
  const filter: {
    skillName?: string;
    mode?: string;
    backendName?: string;
    limit?: number;
  } = {};
  const skill = p.get('skill');
  const mode = p.get('mode');
  const backend = p.get('backend');
  const limit = p.get('limit');
  if (skill) filter.skillName = skill;
  if (mode) filter.mode = mode;
  if (backend) filter.backendName = backend;
  if (limit) {
    const n = Number(limit);
    if (Number.isFinite(n) && n > 0) filter.limit = Math.floor(n);
  }
  return filter;
}

function handleDecisions(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RoutingRouteDeps
): boolean {
  if (!deps.bus) return unavailable(res);
  const filter = parseDecisionsQuery(req.url ?? '');
  sendJSON(res, 200, { decisions: deps.bus.recent(filter) });
  return true;
}

/**
 * Spec B Phase 5 (O3 partial): Zod schema mirroring RoutingUseCase
 * discriminated union. Reject malformed bodies at the wire so the trace
 * handler never hands a bad shape to BackendRouter.resolveDecisionAndDef.
 * The schema is wider than RoutingUseCase (isolation tier is a free
 * string here, IsolationTier in the production type); the router
 * re-validates references against the backends map regardless.
 */
const UseCaseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tier'),
    tier: z.enum(['quick-fix', 'guided-change', 'full-exploration', 'diagnostic']),
  }),
  z.object({ kind: z.literal('intelligence'), layer: z.enum(['sel', 'pesl']) }),
  z.object({ kind: z.literal('isolation'), tier: z.string() }),
  z.object({ kind: z.literal('maintenance') }),
  z.object({ kind: z.literal('chat') }),
  z.object({
    kind: z.literal('skill'),
    skillName: z.string().min(1),
    cognitiveMode: z.string().optional(),
  }),
  z.object({ kind: z.literal('mode'), cognitiveMode: z.string().min(1) }),
]);

const TraceBodySchema = z.object({
  useCase: UseCaseSchema,
  invocationOverride: z.string().min(1).optional(),
  // AMR Phase 3 (SC10): synthetic classification inputs for a dry-run tier +
  // cost derivation. When present, handleTrace derives `tierRequired`/`estCostUsd`
  // WITHOUT dispatching (no LLM classify, no bus emission).
  complexity: z.enum(['trivial', 'simple', 'moderate', 'complex']).optional(),
  risk: z.enum(['low', 'high']).optional(),
});

/**
 * Spec B Phase 5 (O3 partial): trace handler. Constructs a bus-less
 * sibling BackendRouter per-call from the deps' routing+backends
 * snapshots so dry-runs cannot pollute the production ring buffer
 * (acceptance test asserts ring length unchanged after trace). Both
 * routers share the same config, so the trace decision matches what
 * the live router would produce for the same useCase. Per-call
 * allocation is acceptable — trace is operator-driven, not a hot path.
 *
 * Response shape (D-OP-6): `def` is redacted to `{ type }` only so
 * trace output piped to operator logs cannot leak model/endpoint
 * secrets embedded in the BackendDef.
 */
async function handleTrace(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RoutingRouteDeps
): Promise<boolean> {
  if (!deps.routing || !deps.backends) {
    unavailable(res);
    return true;
  }
  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    sendJSON(res, 400, { error: 'body read failed' });
    return true;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: 'invalid JSON body' });
    return true;
  }
  const r = TraceBodySchema.safeParse(parsed);
  if (!r.success) {
    sendJSON(res, 400, { error: r.error.message });
    return true;
  }
  const opts =
    r.data.invocationOverride !== undefined
      ? { invocationOverride: r.data.invocationOverride }
      : undefined;
  try {
    const dryRunRouter = new BackendRouter({
      backends: deps.backends,
      routing: deps.routing,
    });
    const { decision, def } = dryRunRouter.resolveDecisionAndDef(
      r.data.useCase as RoutingUseCase,
      opts
    );
    // AMR Phase 3 (SC10): when synthetic complexity/risk are supplied, derive the
    // required tier + estimated cost WITHOUT dispatching. The tier is TS-derived
    // (never LLM-trusted); no bus emission, so the dry-run invariant holds.
    if (r.data.complexity !== undefined || r.data.risk !== undefined) {
      const verdict: ComplexityVerdict = {
        level: (r.data.complexity ?? 'moderate') as ComplexityLevel,
        confidence: 'high',
        signals: {},
        source: 'static',
      };
      const risk: RoutingRisk =
        r.data.risk === 'high'
          ? { blastRadius: 10, sensitivePath: true }
          : { blastRadius: 0, sensitivePath: false };
      const tierRequired = deriveRequiredTier(
        verdict,
        risk,
        deps.routing.policy ?? {},
        { spentUsd: 0 },
        'fast'
      );
      const estCostUsd = estimateCost(def, { useCase: r.data.useCase as RoutingUseCase });
      sendJSON(res, 200, { decision, def: { type: def.type }, tierRequired, estCostUsd });
      return true;
    }
    sendJSON(res, 200, { decision, def: { type: def.type } });
  } catch (err) {
    sendJSON(res, 500, { error: String(err) });
  }
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
  if (method === 'GET' && DECISIONS_RE.test(url)) return handleDecisions(req, res, deps);
  if (method === 'POST' && TRACE_RE.test(url)) {
    void handleTrace(req, res, deps);
    return true;
  }
  return false;
}
