/**
 * Detail-mode item ceiling for graph retrieval tools.
 *
 * The graph token-savings benchmark (#1271) found that `get_impact` /
 * `query_graph` / `compute_blast_radius` detailed-mode payloads on hub
 * (high-degree) nodes are unbounded — serializing to hundreds of millions of
 * tokens. `boundItems` caps an otherwise-unbounded array to a ceiling and
 * reports whether it truncated so the tool can fail soft (emit `truncated: true`
 * plus a continuation signal) instead of dumping the whole neighborhood.
 */

/**
 * Default maximum number of items returned per array in a graph detailed-mode
 * response. Derived from the #1271 benchmark: at roughly ~125 tokens per
 * serialized graph item, a 200-item ceiling holds a detailed response near
 * ~25k tokens — a >4-orders-of-magnitude reduction from the ~293M-token
 * unbounded worst case, while still returning far more than the summary surface.
 * Overridable via `graph.detailedMode.maxItems` in `harness.config.json`.
 */
export const DEFAULT_GRAPH_DETAIL_CEILING = 200;

/**
 * Result of bounding an array to a ceiling.
 */
export interface BoundedItems<T> {
  /** The items actually returned (length <= ceiling). */
  items: T[];
  /** True when the input exceeded the ceiling and was truncated. */
  truncated: boolean;
  /** Total items available before truncation. */
  totalAvailable: number;
  /** Number of items actually returned (<= ceiling). */
  returned: number;
}

/**
 * Bounds an array to at most `ceiling` items, reporting whether truncation
 * occurred. A non-positive, non-finite, or absent ceiling falls back to
 * {@link DEFAULT_GRAPH_DETAIL_CEILING} so a caller can never accidentally
 * disable the bound by passing `0` or `NaN`.
 *
 * @param items   - The full (already relevance-sorted) array to bound.
 * @param ceiling - Maximum items to keep. Defaults to the graph detail ceiling.
 */
export function boundItems<T>(
  items: readonly T[],
  ceiling: number = DEFAULT_GRAPH_DETAIL_CEILING
): BoundedItems<T> {
  const cap =
    Number.isFinite(ceiling) && ceiling > 0 ? Math.floor(ceiling) : DEFAULT_GRAPH_DETAIL_CEILING;
  const totalAvailable = items.length;
  const bounded = totalAvailable > cap ? items.slice(0, cap) : [...items];
  return {
    items: bounded,
    truncated: totalAvailable > cap,
    totalAvailable,
    returned: bounded.length,
  };
}
