/**
 * Refinement-request demand taxonomy and aggregation (progressive context).
 *
 * Full-resolution-by-default context spends tokens against the *possibility* of
 * attention rather than its presence. Progressive serving replaces that guess
 * with a measured demand signal: refinement frequency per context class. This
 * module is the pure, IO-free half of that measurement layer — the taxonomy,
 * the operation → context-class classifier, the logged-request shape, and the
 * {@link aggregateDemand} rollup. The filesystem writer/reader lives in the CLI
 * (`packages/cli/src/mcp/tools/refinement-telemetry.ts`), mirroring the
 * skill-telemetry seam (pure core + IO-injected CLI).
 *
 * The taxonomy here is the progressive **domain** axis
 * (`file-content | history | telemetry | knowledge`) — deliberately distinct
 * from the loading-axis `ContextClass` in `./attribution` (D1). A downstream
 * reader scoring dictionary membership by demand needs the domain axis.
 */

/**
 * The progressive-domain context classes. This is the *domain* a refinement
 * touches — distinct from the loading-axis {@link ContextClass} in
 * `./attribution` (see spec D1). Do not conflate the two.
 */
export type RefinementContextClass = 'file-content' | 'history' | 'telemetry' | 'knowledge';

/** All refinement context classes, in canonical report order. */
export const REFINEMENT_CONTEXT_CLASSES: readonly RefinementContextClass[] = [
  'file-content',
  'history',
  'telemetry',
  'knowledge',
];

/**
 * The refinement operations. The first three (`outline` / `search` / `unfold`)
 * have real MCP tools today; the `expand-*` operations exist in the taxonomy so
 * the demand aggregation enumerates every class even before their tools land.
 */
export type RefinementOperation =
  | 'outline'
  | 'search'
  | 'unfold'
  | 'expand-diff'
  | 'expand-rationale'
  | 'expand-telemetry';

/**
 * Fixed operation → default context-class table (documented, stable). A caller
 * may override the default per request (e.g. an `unfold` of a knowledge node's
 * rationale records `knowledge`), but absent an override this table decides.
 */
export const OPERATION_CONTEXT_CLASS: Record<RefinementOperation, RefinementContextClass> = {
  outline: 'file-content',
  search: 'file-content',
  unfold: 'file-content',
  'expand-diff': 'history',
  'expand-rationale': 'knowledge',
  'expand-telemetry': 'telemetry',
};

/**
 * One logged refinement request — the JSONL line shape. `timestamp` is stamped
 * by the writer on append.
 */
export interface RefinementRequest {
  operation: RefinementOperation;
  contextClass: RefinementContextClass;
  /** e.g. file path or symbol; a non-identifying label. */
  target?: string;
  /** ISO 8601; stamped by the writer. */
  timestamp?: string;
}

/** Classify an operation to its default context class (an override wins upstream). */
export function classifyRefinement(operation: RefinementOperation): RefinementContextClass {
  return OPERATION_CONTEXT_CLASS[operation];
}

/** Per-class demand: how often the class was refined, absolute and normalized. */
export interface ClassDemand {
  contextClass: RefinementContextClass;
  count: number;
  /** count / total; 0 when total is 0. */
  frequency: number;
}

/** The aggregated demand signal: total refinements and a ranked per-class table. */
export interface RefinementDemandReport {
  total: number;
  /** Ranked: count desc, then canonical class order. Every class appears. */
  byClass: ClassDemand[];
}

/**
 * Pure aggregation of refinement requests into the demand signal.
 *
 * Enumerates **every** {@link RefinementContextClass} — including classes with
 * zero recorded requests — computes `frequency = count / total` (0 when total is
 * 0), and ranks by count descending with ties broken by canonical class order.
 * A class nobody refined therefore sorts to the bottom with `count: 0`, which is
 * the mechanism behind the never-read-ranks-last guarantee (spec D4).
 */
export function aggregateDemand(requests: readonly RefinementRequest[]): RefinementDemandReport {
  const counts = new Map<RefinementContextClass, number>();
  for (const cls of REFINEMENT_CONTEXT_CLASSES) counts.set(cls, 0);
  for (const request of requests) {
    counts.set(request.contextClass, (counts.get(request.contextClass) ?? 0) + 1);
  }

  const total = requests.length;
  const canonicalIndex = (cls: RefinementContextClass): number =>
    REFINEMENT_CONTEXT_CLASSES.indexOf(cls);

  const byClass: ClassDemand[] = REFINEMENT_CONTEXT_CLASSES.map((contextClass) => {
    const count = counts.get(contextClass) ?? 0;
    return { contextClass, count, frequency: total === 0 ? 0 : count / total };
  }).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return canonicalIndex(a.contextClass) - canonicalIndex(b.contextClass);
  });

  return { total, byClass };
}
