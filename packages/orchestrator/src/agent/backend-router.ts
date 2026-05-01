import type { BackendDef, RoutingConfig } from '@harness-engineering/types';

export interface BackendRouterOptions {
  backends: Record<string, BackendDef>;
  routing: RoutingConfig;
}

/**
 * BackendRouter
 *
 * Owns the lookup from a routing scope (and optional intelligence layer)
 * to a named backend. Construction-time validation guarantees every name
 * referenced by `routing` is present in `backends` so runtime lookups are
 * total and never throw on unknown-name references (D6/D7).
 *
 * Lookups for unknown scope strings or scopes mapped to undefined fall
 * back to `routing.default` without throwing — this matches the spec's
 * "every use case inherits default unless explicitly routed" semantics.
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
   * Returns the backend name for a given scope. Optional intelligenceLayer
   * routes through `routing.intelligence[layer]` instead of the top-level
   * scope. Both fall back to `routing.default` when unmapped.
   */
  getBackendName(scope: string, intelligenceLayer?: string): string {
    if (intelligenceLayer !== undefined) {
      const intel = this.routing.intelligence as Record<string, string | undefined> | undefined;
      const named = intel?.[intelligenceLayer];
      return named ?? this.routing.default;
    }
    const top = this.routing as unknown as Record<string, string | undefined>;
    const named = top[scope];
    return named ?? this.routing.default;
  }

  /**
   * Returns the BackendDef reference for the resolved name. Returns the
   * exact reference held in `backends` (no copy) so identity comparisons
   * succeed (SC21).
   */
  getBackend(scope: string, intelligenceLayer?: string): BackendDef {
    const name = this.getBackendName(scope, intelligenceLayer);
    const def = this.backends[name];
    if (!def) {
      // Should be unreachable thanks to construction-time validation, but
      // we throw rather than return a phantom undefined.
      throw new Error(
        `BackendRouter.getBackend: routing target '${name}' is not in backends ` +
          `(scope='${scope}'${intelligenceLayer ? `, intelligenceLayer='${intelligenceLayer}'` : ''}).`
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
