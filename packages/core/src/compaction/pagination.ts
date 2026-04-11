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
  /** Total items available (null if expensive to compute). */
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
  const sliced = items.slice(offset, offset + limit);
  return {
    items: sliced,
    pagination: {
      offset,
      limit,
      total: items.length,
      hasMore: offset + limit < items.length,
    },
  };
}
