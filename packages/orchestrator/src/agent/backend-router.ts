import type { BackendDef, RoutingConfig, RoutingUseCase } from '@harness-engineering/types';

export interface BackendRouterOptions {
  backends: Record<string, BackendDef>;
  routing: RoutingConfig;
}

/**
 * BackendRouter
 *
 * Owns the lookup from a `RoutingUseCase` (a discriminated query — tier,
 * intelligence layer, maintenance, chat) to a named backend.
 * Construction-time validation guarantees every name referenced by
 * `routing` is present in `backends` so runtime lookups are total and
 * never throw on unknown-name references (D6/D7).
 *
 * Lookups for tier/intelligence use cases that fall through to undefined
 * mappings return `routing.default` without throwing — this matches the
 * spec's "every use case inherits default unless explicitly routed"
 * semantics. The `maintenance` and `chat` kinds always resolve to
 * `routing.default` (SC19, SC20).
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
   * - `maintenance` / `chat`: always `routing.default`.
   */
  resolve(useCase: RoutingUseCase): string {
    switch (useCase.kind) {
      case 'tier': {
        const named = (this.routing as unknown as Record<string, string | undefined>)[useCase.tier];
        return named ?? this.routing.default;
      }
      case 'intelligence': {
        const intel = this.routing.intelligence as Record<string, string | undefined> | undefined;
        return intel?.[useCase.layer] ?? this.routing.default;
      }
      case 'maintenance':
      case 'chat':
        return this.routing.default;
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

  private validateReferences(): void {
    const known = new Set(Object.keys(this.backends));
    const missing: Array<{ path: string; name: string }> = [];

    const check = (path: string, name: string | undefined) => {
      if (name !== undefined && !known.has(name)) missing.push({ path, name });
    };

    check('default', this.routing.default);
    check('quick-fix', this.routing['quick-fix']);
    check('guided-change', this.routing['guided-change']);
    check('full-exploration', this.routing['full-exploration']);
    check('diagnostic', this.routing.diagnostic);
    check('intelligence.sel', this.routing.intelligence?.sel);
    check('intelligence.pesl', this.routing.intelligence?.pesl);

    if (missing.length > 0) {
      const detail = missing.map(({ path, name }) => `routing.${path} -> '${name}'`).join('; ');
      const known_ = [...known].join(', ') || '(none)';
      throw new Error(
        `BackendRouter: routing references unknown backend(s): ${detail}. Defined backends: [${known_}].`
      );
    }
  }
}
