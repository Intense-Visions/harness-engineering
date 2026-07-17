import type {
  BackendDef,
  IsolationTier,
  ResolutionSource,
  ResolutionStep,
  RoutingConfig,
  RoutingDecision,
  RoutingUseCase,
  RoutingValue,
} from '@harness-engineering/types';
import type { RoutingDecisionBus } from '../routing/decision-bus.js';

export interface BackendRouterOptions {
  backends: Record<string, BackendDef>;
  routing: RoutingConfig;
  /**
   * Spec B Phase 4 (D8): when present, every resolve() emits its
   * decision onto the bus. The bus owns the structured log line + ring
   * buffer; the router stays a pure resolution function.
   */
  decisionBus?: RoutingDecisionBus;
}

/**
 * Spec B Phase 1: normalize a {@link RoutingValue} to a non-empty
 * readonly tuple of backend names. Scalar `'X'` becomes `['X']`; chain
 * `['X', 'Y']` is returned unchanged. This is the canonical
 * normalization the chain-walk resolver consumes.
 *
 * The non-empty return type (`readonly [string, ...string[]]`) flows
 * directly from `RoutingValue`'s tuple guarantee and lets callers
 * index `[0]` without `noUncheckedIndexedAccess` raising
 * `T | undefined`.
 *
 * Internal helper — not re-exported from the package barrel.
 */
export function toArray(value: RoutingValue): readonly [string, ...string[]] {
  // RoutingValue = string | readonly [string, ...string[]]. Array.isArray
  // narrows the union to its tuple branch but TypeScript widens the
  // readonly tuple to `RoutingValue & any[]`; the cast restores the
  // declared non-empty tuple shape so callers can index [0] safely
  // under `noUncheckedIndexedAccess`.
  return Array.isArray(value)
    ? (value as unknown as readonly [string, ...string[]])
    : [value as string];
}

/**
 * BackendRouter (Spec B Phase 1)
 *
 * Owns the lookup from a {@link RoutingUseCase} (a discriminated query
 * — tier, intelligence layer, maintenance, chat, isolation, **skill**,
 * **mode**) to a {@link RoutingDecision} naming a chosen backend and
 * the full resolution path that produced it.
 *
 * Resolution order (D2): invocation override -> per-skill -> per-mode
 * -> existing per-tier/intelligence/isolation/maintenance/chat ->
 * `routing.default`. Within each source, fallback chain entries are
 * tried in declared order; first existing backend wins. Unknown
 * entries are recorded with `outcome: 'unknown-backend'` and the walk
 * continues.
 *
 * Construction-time validation guarantees every name referenced by
 * `routing` is present in `backends` so the static-config case can
 * never produce a runtime exhaustion throw. The runtime throw at the
 * end of `resolve()` is a safety net for future dynamic-backends
 * scenarios where a chain entry can become unknown post-construction.
 */
export class BackendRouter {
  private readonly backends: Record<string, BackendDef>;
  private readonly routing: RoutingConfig;
  private readonly decisionBus: RoutingDecisionBus | undefined;

  constructor(opts: BackendRouterOptions) {
    this.backends = opts.backends;
    this.routing = opts.routing;
    this.decisionBus = opts.decisionBus;
    this.validateReferences();
  }

  /**
   * Resolve a {@link RoutingUseCase} to a {@link RoutingDecision}.
   *
   * @param useCase the routing query
   * @param opts.invocationOverride if set and the named backend exists,
   *   beats all other sources (D7 — the `--backend <name>` escape hatch)
   */
  resolve(useCase: RoutingUseCase, opts?: { invocationOverride?: string }): RoutingDecision {
    const startedAt = performance.now();
    const path: ResolutionStep[] = [];

    const tryChain = (
      source: ResolutionSource,
      value: RoutingValue | undefined
    ): string | undefined => {
      if (value === undefined) return undefined;
      for (const name of toArray(value)) {
        const step: ResolutionStep = { source, candidate: name, outcome: 'considered' };
        path.push(step);
        if (this.backends[name]) {
          step.outcome = 'chosen';
          return name;
        }
        step.outcome = 'unknown-backend';
      }
      return undefined;
    };

    const decide = (backendName: string): RoutingDecision => {
      const def = this.backends[backendName];
      if (!def) {
        // Unreachable: tryChain only returns a name with this.backends[name] truthy.
        throw new Error(
          `BackendRouter.resolve: internal invariant violated — backend '${backendName}' missing.`
        );
      }
      return {
        timestamp: new Date().toISOString(),
        useCase,
        resolutionPath: path,
        backendName,
        backendType: def.type,
        durationMs: performance.now() - startedAt,
      };
    };

    // Spec B Phase 4 (D8): emit on every successful return path.
    // The bus owns the structured log line + ring buffer; the router
    // stays a pure resolution function. Exhaustion (the throw at the
    // end of resolve) does NOT emit — it is an error path.
    const emitAndReturn = (decision: RoutingDecision): RoutingDecision => {
      this.decisionBus?.emit(decision);
      return decision;
    };

    // 1. Invocation override (D7).
    const fromInvocation = tryChain(
      'invocation',
      opts?.invocationOverride !== undefined ? opts.invocationOverride : undefined
    );
    if (fromInvocation) return emitAndReturn(decide(fromInvocation));

    // 2. Per-skill (D1).
    if (useCase.kind === 'skill') {
      const fromSkill = tryChain('skill', this.routing.skills?.[useCase.skillName]);
      if (fromSkill) return emitAndReturn(decide(fromSkill));
    }

    // 3. Per-mode (D1) — fires for kind: 'mode' AND kind: 'skill' with a cognitiveMode.
    const mode =
      useCase.kind === 'skill'
        ? useCase.cognitiveMode
        : useCase.kind === 'mode'
          ? useCase.cognitiveMode
          : undefined;
    if (mode !== undefined) {
      const fromMode = tryChain('mode', this.routing.modes?.[mode]);
      if (fromMode) return emitAndReturn(decide(fromMode));
    }

    // 4. Existing per-tier / intelligence / isolation / maintenance / chat.
    const fromExisting = this.resolveExistingUseCase(useCase);
    if (fromExisting !== undefined) {
      const chained = tryChain('tier', fromExisting);
      if (chained) return emitAndReturn(decide(chained));
    }

    // 5. Default fallback (required field).
    const fromDefault = tryChain('default', this.routing.default);
    if (fromDefault) return emitAndReturn(decide(fromDefault));

    const knownList = Object.keys(this.backends).join(', ') || '(none)';
    throw new Error(
      `BackendRouter.resolve: routing.default produced no available backend ` +
        `for useCase=${JSON.stringify(useCase)}. ` +
        `Resolution path: ${JSON.stringify(path)}. Known backends: [${knownList}].`
    );
  }

  /**
   * True iff `useCase` is a BARE SKILL stage — `kind:'skill'` with NO
   * `cognitiveMode` and NO `routing.skills[skillName]` binding — so `resolve()`
   * (absent an `invocationOverride`) would fall through to step 5 `routing.default`.
   *
   * The AMR path uses this to decide whether `selectCheapestQualifying`'s
   * tier-pick may legitimately override the per-phase split. A bare skill
   * execution stage MUST land on `routing.default` (the per-phase execution
   * backend), so AMR must NOT hand it an `invocationOverride` (that would
   * short-circuit resolve step 1 and mis-route it to the tier-cheapest backend —
   * the #876 execution-stage mis-route).
   *
   * Deliberately SCOPED to skill use cases: a `kind:'tier'` / `'intelligence'`
   * useCase with no explicit routing binding ALSO falls to default in `resolve()`,
   * but for those AMR tier selection is the INTENDED override (Task 5's
   * cheapest-qualifying selection), so they return `false` here. A design stage
   * (`cognitiveMode` bound in `routing.modes`) or a per-skill-overridden stage also
   * returns `false`, so AMR/#876 per-mode routing stays intact.
   *
   * Read-only over the router's own routing config (no mutation, no resolution).
   */
  wouldFallToDefault(useCase: RoutingUseCase): boolean {
    if (useCase.kind !== 'skill') return false;
    // A per-skill (step 2) binding wins over default.
    if (this.routing.skills?.[useCase.skillName] !== undefined) return false;
    // A bound cognitiveMode (step 3, #876 design-stage routing) wins over default.
    const mode = useCase.cognitiveMode;
    if (mode !== undefined && this.routing.modes?.[mode] !== undefined) return false;
    // Bare skill, no per-skill/per-mode binding ⇒ resolve() falls to routing.default.
    return true;
  }

  /**
   * Returns the {@link BackendDef} reference for the resolved name.
   * Identity-equal to the entry in `backends` (no copy) so callers
   * relying on reference equality (SC21) continue to work.
   */
  resolveDefinition(useCase: RoutingUseCase, opts?: { invocationOverride?: string }): BackendDef {
    const decision = this.resolve(useCase, opts);
    const def = this.backends[decision.backendName];
    if (!def) {
      // Unreachable: resolve() only returns a name present in backends.
      throw new Error(
        `BackendRouter.resolveDefinition: routing target '${decision.backendName}' is not in backends ` +
          `(useCase=${JSON.stringify(useCase)}).`
      );
    }
    return def;
  }

  /**
   * Spec B Phase 4 (closes P1-IMP-2): a single resolve() + def lookup
   * for callers that need both. Replaces the previous pattern of
   * `resolveDefinition(useCase) + resolve(useCase)` which produced two
   * RoutingDecision emissions per dispatch — doubling routing-decision
   * log volume now that Phase 4 emits.
   *
   * Identity-equal `BackendDef` (no copy) so callers relying on
   * reference equality (SC21) continue to work.
   */
  resolveDecisionAndDef(
    useCase: RoutingUseCase,
    opts?: { invocationOverride?: string }
  ): { decision: RoutingDecision; def: BackendDef } {
    const decision = this.resolve(useCase, opts);
    const def = this.backends[decision.backendName];
    if (!def) {
      // Unreachable: resolve() only returns a name present in backends.
      throw new Error(
        `BackendRouter.resolveDecisionAndDef: routing target '${decision.backendName}' is not in backends ` +
          `(useCase=${JSON.stringify(useCase)}).`
      );
    }
    return { decision, def };
  }

  /**
   * The pre-Spec-B resolution helper: returns the configured
   * {@link RoutingValue} for tier/intelligence/isolation/maintenance/chat
   * use cases (or `undefined` for skill/mode use cases, which are owned
   * by the per-skill / per-mode steps in {@link resolve}). Returning
   * `undefined` lets the caller fall through to `routing.default`.
   */
  private resolveExistingUseCase(useCase: RoutingUseCase): RoutingValue | undefined {
    switch (useCase.kind) {
      case 'tier': {
        const tierMap = this.routing as unknown as Record<string, RoutingValue | undefined>;
        return tierMap[useCase.tier];
      }
      case 'intelligence': {
        const intel = this.routing.intelligence as
          | Record<string, RoutingValue | undefined>
          | undefined;
        return intel?.[useCase.layer];
      }
      case 'isolation': {
        const iso = this.routing.isolation as
          | Record<IsolationTier, RoutingValue | undefined>
          | undefined;
        return iso?.[useCase.tier];
      }
      case 'maintenance':
      case 'chat':
        // Always default per SC19, SC20.
        return undefined;
      case 'skill':
      case 'mode':
        // Owned by the per-skill / per-mode steps; here we fall through to default.
        return undefined;
    }
  }

  private validateReferences(): void {
    const known = new Set(Object.keys(this.backends));
    const missing: Array<{ path: string; name: string }> = [];

    const check = (label: string, value: RoutingValue | undefined) => {
      if (value === undefined) return;
      for (const name of toArray(value)) {
        if (!known.has(name)) missing.push({ path: label, name });
      }
    };

    check('default', this.routing.default);
    check('quick-fix', this.routing['quick-fix']);
    check('guided-change', this.routing['guided-change']);
    check('full-exploration', this.routing['full-exploration']);
    check('diagnostic', this.routing.diagnostic);
    check('intelligence.sel', this.routing.intelligence?.sel);
    check('intelligence.pesl', this.routing.intelligence?.pesl);
    check('isolation.none', this.routing.isolation?.none);
    check('isolation.container', this.routing.isolation?.container);
    check('isolation.remote-sandbox', this.routing.isolation?.['remote-sandbox']);
    // Phase 1 NEW: validate per-skill + per-mode chain entries too.
    for (const [skill, value] of Object.entries(this.routing.skills ?? {})) {
      check(`skills.${skill}`, value);
    }
    for (const [mode, value] of Object.entries(this.routing.modes ?? {})) {
      check(`modes.${mode}`, value);
    }

    if (missing.length > 0) {
      const detail = missing.map(({ path, name }) => `routing.${path} -> '${name}'`).join('; ');
      const known_ = [...known].join(', ') || '(none)';
      throw new Error(
        `BackendRouter: routing references unknown backend(s): ${detail}. Defined backends: [${known_}].`
      );
    }
  }
}
