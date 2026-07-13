import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  BackendDef,
  CapabilityTier,
  ComplexityLevel,
  ComplexityVerdict,
  RoutingConfig,
  RoutingDecision,
  RoutingPolicy,
  RoutingRisk,
  RoutingTelemetry,
  RoutingStatus,
  RoutingUseCase,
  RoutingValue,
} from '@harness-engineering/types';
import { z } from 'zod';
import { deriveRequiredTier } from '@harness-engineering/intelligence';
import { BackendRouter, toArray } from '../../../agent/backend-router';
import { estimateCost } from '../../../agent/cost-estimator';
import {
  buildCapabilityRegistry,
  selectCheapestQualifying,
  PrivacyNoMatch,
} from '../../../agent/capability-registry';
import type { RoutingDecisionBus } from '../../../routing/decision-bus';
import { readBody } from '../../utils';

const CONFIG_RE = /^\/api\/v1\/routing\/config(?:\?.*)?$/;
const DECISIONS_RE = /^\/api\/v1\/routing\/decisions(?:\?.*)?$/;
const TRACE_RE = /^\/api\/v1\/routing\/trace(?:\?.*)?$/;
const POLICY_RE = /^\/api\/v1\/routing\/policy(?:\?.*)?$/;
const TELEMETRY_RE = /^\/api\/v1\/routing\/telemetry(?:\?.*)?$/;
const STATUS_RE = /^\/api\/v1\/routing\/status(?:\?.*)?$/;

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
  /**
   * AMR Phase 5 (D1): hot-swap the live AdaptiveRouter for a pushed policy.
   * Absent/null when the routing subsystem is absent (no backendFactory) — the
   * PUT handler renders 503, mirroring the other routes' `unavailable` guard.
   */
  ingestRoutingPolicy?: ((policy: RoutingPolicy) => void) | null;
  /**
   * AMR Phase 5 (D2): project the enriched decision ring into the Shuttle wire
   * shape. Absent/null in fakes/tests ⇒ the GET returns an empty payload (safe).
   */
  getTelemetry?: (() => RoutingTelemetry) | null;
  /**
   * AMR observability: live operator status (budget/escalation/allowlist).
   * Absent/null ⇒ the GET returns an inactive payload.
   */
  getStatus?: (() => RoutingStatus) | null;
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

/**
 * AMR Phase 3 (SC10): derive the dry-run `tierRequired` + `estCostUsd` from
 * synthetic complexity/risk inputs WITHOUT dispatching (no LLM classify, no bus
 * emission). Extracted from {@link handleTrace} so the handler's nested branch
 * no longer blows the complexity budget; behavior is byte-identical.
 *
 * Costs the TIER-SELECTED backend (what the AdaptiveRouter would dispatch to at
 * `tierRequired`), not the identity-routed `def`: pick the cheapest backend
 * qualifying at `tierRequired`; if selection abstains (tier/cost exclusion, or
 * PrivacyNoMatch) fall through to the identity `def` (SC8 semantics — identity
 * IS the resolution, so tier and costed backend agree).
 */
function deriveTraceCost(
  body: z.infer<typeof TraceBodySchema>,
  decision: RoutingDecision,
  def: BackendDef,
  routing: RoutingConfig,
  backends: Record<string, BackendDef>
): { tierRequired: CapabilityTier; estCostUsd: number; costedBackendName: string } {
  const verdict: ComplexityVerdict = {
    level: (body.complexity ?? 'moderate') as ComplexityLevel,
    confidence: 'high',
    signals: {},
    source: 'static',
  };
  const risk: RoutingRisk =
    body.risk === 'high'
      ? { blastRadius: 10, sensitivePath: true }
      : { blastRadius: 0, sensitivePath: false };
  const tierRequired = deriveRequiredTier(
    verdict,
    risk,
    routing.policy ?? {},
    { spentUsd: 0 },
    'fast'
  );
  const { costedDef, costedName } = selectCostedBackend(
    tierRequired,
    decision,
    def,
    routing,
    backends
  );
  const estCostUsd = estimateCost(costedDef, { useCase: body.useCase as RoutingUseCase });
  return { tierRequired, estCostUsd, costedBackendName: costedName };
}

/**
 * SC10 consistency: pick the cheapest backend qualifying at `tierRequired`
 * (mirroring the router's selection). Falls back to the identity `def`/`decision`
 * when selection abstains or raises {@link PrivacyNoMatch}. Extracted so the
 * try/catch branch doesn't count against the caller's complexity budget.
 */
function selectCostedBackend(
  tierRequired: CapabilityTier,
  decision: RoutingDecision,
  def: BackendDef,
  routing: RoutingConfig,
  backends: Record<string, BackendDef>
): { costedDef: BackendDef; costedName: string } {
  const registry = buildCapabilityRegistry(backends);
  const providerOf = (name: string): BackendDef['type'] | undefined => backends[name]?.type;
  try {
    const selected = selectCheapestQualifying(
      registry,
      tierRequired,
      routing.policy?.privacyFloor !== undefined
        ? { privacyFloor: routing.policy.privacyFloor }
        : {},
      providerOf
    );
    const selectedDef = selected !== undefined ? backends[selected.name] : undefined;
    if (selected !== undefined && selectedDef !== undefined) {
      return { costedDef: selectedDef, costedName: selected.name };
    }
  } catch (selErr) {
    // PrivacyNoMatch ⇒ no compliant backend at this tier; keep identity `def`
    // for the cost estimate (the trace is best-effort, non-dispatching).
    if (!(selErr instanceof PrivacyNoMatch)) throw selErr;
  }
  return { costedDef: def, costedName: decision.backendName };
}

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
      const { tierRequired, estCostUsd, costedBackendName } = deriveTraceCost(
        r.data,
        decision,
        def,
        deps.routing,
        deps.backends
      );
      sendJSON(res, 200, {
        decision,
        def: { type: def.type },
        tierRequired,
        estCostUsd,
        // Name the backend the cost belongs to so operators see tier↔cost↔backend
        // are consistent (was implicit + divergent before this fix).
        costedBackendName,
      });
      return true;
    }
    sendJSON(res, 200, { decision, def: { type: def.type } });
  } catch (err) {
    sendJSON(res, 500, { error: String(err) });
  }
  return true;
}

const CAPABILITY_TIER = z.enum(['fast', 'standard', 'strong']);
const COMPLEXITY_LEVEL = z.enum(['trivial', 'simple', 'moderate', 'complex']);
const PRIVACY_CLASS = z.enum(['on-device', 'byo-endpoint', 'shared-cloud']);

/**
 * AMR Phase 5 (D3/D4): inbound `RoutingPolicy` schema for `PUT /routing/policy`.
 * Mirrors the `RoutingPolicy` interface; NOT `.strict()` so the schema tolerates
 * forward-compatible extra fields the Shuttle control plane may add.
 *
 * `allowedProviders` is validated as `string[]`, NOT narrowed to the finite
 * `BackendDef['type']` union: Shuttle types it `readonly string[]`, and an
 * unknown provider string must fail CLOSED at tier selection (it simply never
 * matches a backend `type`) rather than 4xx-ing the entire policy push
 * (Phase-1 review note). An empty `{}` body is valid — it restores default-off.
 */
const RoutingPolicySchema = z.object({
  complexityTierMatrix: z.record(COMPLEXITY_LEVEL, CAPABILITY_TIER).optional(),
  skillTierOverrides: z.record(z.string(), CAPABILITY_TIER).optional(),
  privacyFloor: PRIVACY_CLASS.optional(),
  budget: z
    .object({
      capUsd: z.number(),
      degradeAtPct: z.number().optional(),
      onBudgetExhausted: z.enum(['degrade', 'pause', 'human']),
    })
    .optional(),
  sensitivePaths: z.array(z.string()).optional(),
  escalationThreshold: z.number().optional(),
  allowedProviders: z.array(z.string()).optional(),
});

/**
 * AMR Phase 5 (D1/D4/D5): `PUT /api/v1/routing/policy`. Validates a
 * `RoutingPolicy`, hot-swaps the live router via `ingestRoutingPolicy`, and
 * returns 204 (no body — matches Shuttle's 204-safe client). An empty `{}`
 * policy restores default-off (D5). 503 when routing is unavailable (no
 * backends), mirroring the sibling routes. Scope `admin` is enforced upstream
 * by `V1_BRIDGE_ROUTES`.
 *
 * Note (D1): a policy UPDATE preserves the live `EscalationState` climbed floors
 * (setPolicy path); a changed `escalationThreshold` does NOT take effect until
 * the router is reconstructed (disable then re-enable) — see AdaptiveRouter.setPolicy.
 */
async function handlePolicy(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RoutingRouteDeps
): Promise<boolean> {
  if (!deps.ingestRoutingPolicy || deps.router === null) return unavailable(res);
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
  const r = RoutingPolicySchema.safeParse(parsed);
  if (!r.success) {
    sendJSON(res, 400, { error: r.error.message });
    return true;
  }
  // Strip-to-empty guard (review): the schema tolerates unknown fields
  // (forward-compat, D3) by STRIPPING them. But a body that had keys yet
  // validated to `{}` means every field was unrecognized (a typo or wrong
  // shape) — that must NOT be silently treated as the intentional `{}` disable
  // (D5), which would tear down the live router + its EscalationState behind a
  // 204. A real disable is a LITERAL empty object.
  const rawKeyCount =
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed as Record<string, unknown>).length
      : 0;
  if (rawKeyCount > 0 && Object.keys(r.data).length === 0) {
    sendJSON(res, 400, {
      error: 'no recognized routing-policy fields (to disable routing, send an empty object {})',
    });
    return true;
  }
  // `allowedProviders: string[]` widens `BackendDef['type'][]`; the validated
  // wire object is the boundary — narrow it to the domain type here. Guard the
  // ingest so a future throw in router construction returns 500 rather than
  // becoming an unhandled rejection (the dispatcher fire-and-forgets this).
  try {
    deps.ingestRoutingPolicy(r.data as RoutingPolicy);
  } catch (err) {
    sendJSON(res, 500, { error: String(err) });
    return true;
  }
  res.writeHead(204);
  res.end();
  return true;
}

/**
 * AMR Phase 5 (D2): `GET /api/v1/routing/telemetry`. Projects the enriched
 * decision ring into the Shuttle wire shape (`{ decisions, spentUsd }`).
 * Idempotent/non-destructive; always 200 — an empty payload when routing is off
 * or the accessor is absent (fakes) — so Shuttle can poll harmlessly. Scope
 * `read-telemetry` is enforced upstream.
 */
function handleTelemetry(res: ServerResponse, deps: RoutingRouteDeps): boolean {
  const telemetry: RoutingTelemetry = deps.getTelemetry?.() ?? { decisions: [], spentUsd: 0 };
  sendJSON(res, 200, telemetry);
  return true;
}

/**
 * AMR observability: `GET /api/v1/routing/status`. The live operator view —
 * budget spend-vs-cap, escalated units, allowlist. Idempotent; always 200 (an
 * inactive payload when AMR is off / the accessor is absent). `read-telemetry`.
 */
function handleStatus(res: ServerResponse, deps: RoutingRouteDeps): boolean {
  const status: RoutingStatus = deps.getStatus?.() ?? {
    active: false,
    budget: null,
    escalation: [],
    allowedProviders: null,
  };
  sendJSON(res, 200, status);
  return true;
}

/**
 * Spec B Phase 5 + AMR Phase 5 dispatcher:
 *   GET  /api/v1/routing/config     — resolved config + chains
 *   GET  /api/v1/routing/decisions  — recent decision ring
 *   POST /api/v1/routing/trace      — dry-run a decision
 *   PUT  /api/v1/routing/policy     — hot-swap the routing policy (AMR D1)
 *   GET  /api/v1/routing/telemetry  — Shuttle telemetry projection (AMR D2)
 * Returns true when the route matched (response was written) and false to let
 * the caller fall through to the next handler in the table.
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
  if (method === 'PUT' && POLICY_RE.test(url)) {
    void handlePolicy(req, res, deps);
    return true;
  }
  if (method === 'GET' && TELEMETRY_RE.test(url)) return handleTelemetry(res, deps);
  if (method === 'GET' && STATUS_RE.test(url)) return handleStatus(res, deps);
  return false;
}
