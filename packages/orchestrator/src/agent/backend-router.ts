import type {
  BackendDef,
  IsolationTier,
  RoutingConfig,
  RoutingUseCase,
  RoutingValue,
} from '@harness-engineering/types';

export interface BackendRouterOptions {
  backends: Record<string, BackendDef>;
  routing: RoutingConfig;
}

/**
 * Spec B Phase 0 normalization: collapse a {@link RoutingValue} to the
 * first backend name. Scalar inputs are returned unchanged
 * (byte-identical to pre-Spec-B behavior). Array-form inputs return the
 * first element.
 *
 * Exported as a module-level helper so the small number of "surprise
 * consumers" of widened {@link RoutingValue} fields (e.g.
 * `intelligence-factory.ts`) can normalize through a single canonical
 * implementation. Phase 1 of Spec B replaces the body of this function
 * with the proper chain-walk resolver; every caller upgrades in
 * lockstep at that point.
 */
export function toScalar(value: RoutingValue): string {
  return Array.isArray(value) ? value[0] : (value as string);
}

/**
 * BackendRouter
 *
 * Owns the lookup from a `RoutingUseCase` (a discriminated query — tier,
 * intelligence layer, maintenance, chat, isolation) to a named backend.
 * Construction-time validation guarantees every name referenced by
 * `routing` is present in `backends` so runtime lookups are total and
 * never throw on unknown-name references (D6/D7).
 *
 * Lookups for tier/intelligence use cases that fall through to undefined
 * mappings return `routing.default` without throwing — this matches the
 * spec's "every use case inherits default unless explicitly routed"
 * semantics. The `maintenance` and `chat` kinds always resolve to
 * `routing.default` (SC19, SC20).
 *
 * Spec B Phase 0 note: `RoutingConfig` fields are typed as
 * {@link RoutingValue} (`string | readonly [string, ...string[]]`).
 * This class normalizes via {@link BackendRouter.toScalar} (first
 * element of the chain) to preserve byte-identical behavior for scalar
 * inputs. The full chain walk (try entries in order, skip unknown
 * backends) lands in Phase 1 of Spec B.
 *
 * Spec B Phase 0 also adds the `kind: 'skill'` and `kind: 'mode'` use
 * case variants. Until Phase 1's resolver rewrite, these variants fall
 * through to `routing.default` (no behavior change — pre-Spec-B configs
 * never construct these variants).
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
   * Returns the backend name for a given use case.
   *
   * - `tier`: per-tier override, falling back to `routing.default`.
   * - `intelligence`: per-layer override under `routing.intelligence`,
   *   falling back to `routing.default`.
   * - `isolation`: per-tier override under `routing.isolation`,
   *   falling back to `routing.default`.
   * - `maintenance` / `chat`: always `routing.default`.
   * - `skill` / `mode` (Spec B Phase 0): always `routing.default` until
   *   Phase 1 wires the resolver chain.
   */
  resolve(useCase: RoutingUseCase): string {
    switch (useCase.kind) {
      case 'tier': {
        const tierMap = this.routing as unknown as Record<string, RoutingValue | undefined>;
        const named = tierMap[useCase.tier];
        return named !== undefined ? this.toScalar(named) : this.toScalar(this.routing.default);
      }
      case 'intelligence': {
        const intel = this.routing.intelligence as
          | Record<string, RoutingValue | undefined>
          | undefined;
        const named = intel?.[useCase.layer];
        return named !== undefined ? this.toScalar(named) : this.toScalar(this.routing.default);
      }
      case 'isolation': {
        const iso = this.routing.isolation as
          | Record<IsolationTier, RoutingValue | undefined>
          | undefined;
        const named = iso?.[useCase.tier];
        return named !== undefined ? this.toScalar(named) : this.toScalar(this.routing.default);
      }
      case 'maintenance':
      case 'chat':
      case 'skill':
      case 'mode':
        return this.toScalar(this.routing.default);
    }
  }

  /**
   * Returns the BackendDef reference for the resolved name. Returns the
   * exact reference held in `backends` (no copy) so identity comparisons
   * succeed (SC21).
   */
  resolveDefinition(useCase: RoutingUseCase): BackendDef {
    const name = this.resolve(useCase);
    const def = this.backends[name];
    if (!def) {
      // Should be unreachable thanks to construction-time validation, but
      // we throw rather than return a phantom undefined.
      throw new Error(
        `BackendRouter.resolveDefinition: routing target '${name}' is not in backends ` +
          `(useCase=${JSON.stringify(useCase)}).`
      );
    }
    return def;
  }

  /**
   * Spec B Phase 0 normalization: collapse a {@link RoutingValue} to the
   * first backend name. Delegates to the module-level {@link toScalar}
   * helper so external "surprise consumers" of widened RoutingValue
   * fields (e.g. `intelligence-factory.ts`) and the router itself share
   * one canonical implementation. Phase 1 replaces the helper body with
   * the proper chain walk.
   */
  private toScalar(value: RoutingValue): string {
    return toScalar(value);
  }

  private validateReferences(): void {
    const known = new Set(Object.keys(this.backends));
    const missing: Array<{ path: string; name: string }> = [];

    const check = (path: string, value: RoutingValue | undefined) => {
      if (value === undefined) return;
      const names = Array.isArray(value) ? value : [value as string];
      for (const name of names) {
        if (!known.has(name)) missing.push({ path, name });
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

    if (missing.length > 0) {
      const detail = missing.map(({ path, name }) => `routing.${path} -> '${name}'`).join('; ');
      const known_ = [...known].join(', ') || '(none)';
      throw new Error(
        `BackendRouter: routing references unknown backend(s): ${detail}. Defined backends: [${known_}].`
      );
    }
  }
}
