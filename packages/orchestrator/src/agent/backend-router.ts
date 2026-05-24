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

export interface BackendRouterOptions {
  backends: Record<string, BackendDef>;
  routing: RoutingConfig;
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

  constructor(opts: BackendRouterOptions) {
    this.backends = opts.backends;
    this.routing = opts.routing;
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

    // 1. Invocation override (D7).
    const fromInvocation = tryChain(
      'invocation',
      opts?.invocationOverride !== undefined ? opts.invocationOverride : undefined
    );
    if (fromInvocation) return decide(fromInvocation);

    // 2. Per-skill (D1).
    if (useCase.kind === 'skill') {
      const fromSkill = tryChain('skill', this.routing.skills?.[useCase.skillName]);
      if (fromSkill) return decide(fromSkill);
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
      if (fromMode) return decide(fromMode);
    }

    // 4. Existing per-tier / intelligence / isolation / maintenance / chat.
    const fromExisting = this.resolveExistingUseCase(useCase);
    if (fromExisting !== undefined) {
      const chained = tryChain('tier', fromExisting);
      if (chained) return decide(chained);
    }

    // 5. Default fallback (required field).
    const fromDefault = tryChain('default', this.routing.default);
    if (fromDefault) return decide(fromDefault);

    const knownList = Object.keys(this.backends).join(', ') || '(none)';
    throw new Error(
      `BackendRouter.resolve: routing.default produced no available backend ` +
        `for useCase=${JSON.stringify(useCase)}. ` +
        `Resolution path: ${JSON.stringify(path)}. Known backends: [${knownList}].`
    );
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
