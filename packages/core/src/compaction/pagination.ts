/**
 * Pagination types and utility for MCP tool responses.
 *
 * Tools call `paginate()` after sorting results by relevance.
 * The returned `PaginatedSlice` includes metadata that lets agents
 * request subsequent pages on demand via offset/limit params.
 */

export interface PaginationMeta {
  /** Number of items skipped. */
  offset: number;
  /** Maximum items in this page. */
  limit: number;
  /**
   * Total items available. `null` when the producer cannot cheaply compute
   * the count (e.g. streaming or external query). `paginate()` always sets
   * this to `items.length`; tools that build PaginationMeta manually may
   * pass `null`.
   */
  total: number | null;
  /** True if more pages exist beyond this slice. */
  hasMore: boolean;
}

export interface PaginatedSlice<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Pure pagination utility — slices an array and computes pagination metadata.
 *
 * @param items  - The full, relevance-sorted array to paginate.
 * @param offset - Number of items to skip from the start.
 * @param limit  - Maximum number of items to return.
 * @returns A `PaginatedSlice` with the requested page and metadata.
 */
export function paginate<T>(items: T[], offset: number, limit: number): PaginatedSlice<T> {
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(0, limit);
  const sliced = items.slice(safeOffset, safeOffset + safeLimit);
  return {
    items: sliced,
    pagination: {
      offset: safeOffset,
      limit: safeLimit,
      total: items.length,
      hasMore:
        safeOffset + (safeLimit || 1) < items.length ||
        (safeLimit === 0 && safeOffset < items.length),
    },
  };
}
