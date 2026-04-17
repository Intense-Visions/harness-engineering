import { describe, it, expect } from 'vitest';
import {
  paginate,
  type PaginationMeta,
  type PaginatedSlice,
} from '../../src/compaction/pagination';

describe('paginate', () => {
  it('returns the first page with hasMore true when more items exist', () => {
    const result = paginate([1, 2, 3, 4, 5], 0, 3);
    expect(result).toEqual({
      items: [1, 2, 3],
      pagination: { offset: 0, limit: 3, total: 5, hasMore: true },
    });
  });

  it('returns all items with hasMore false when limit exceeds length', () => {
    const result = paginate([1, 2, 3], 0, 10);
    expect(result).toEqual({
      items: [1, 2, 3],
      pagination: { offset: 0, limit: 10, total: 3, hasMore: false },
    });
  });

  it('returns empty items for an empty array', () => {
    const result = paginate([], 0, 10);
    expect(result).toEqual({
      items: [],
      pagination: { offset: 0, limit: 10, total: 0, hasMore: false },
    });
  });

  it('returns empty items when offset is beyond array length', () => {
    const result = paginate([1, 2, 3], 5, 10);
    expect(result).toEqual({
      items: [],
      pagination: { offset: 5, limit: 10, total: 3, hasMore: false },
    });
  });

  it('returns a middle page with correct hasMore', () => {
    const result = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(result).toEqual({
      items: [3, 4],
      pagination: { offset: 2, limit: 2, total: 5, hasMore: true },
    });
  });

  it('returns the last page with hasMore false when offset + limit equals length', () => {
    const result = paginate([1, 2, 3, 4, 5], 3, 2);
    expect(result).toEqual({
      items: [4, 5],
      pagination: { offset: 3, limit: 2, total: 5, hasMore: false },
    });
  });

  it('works with non-numeric item types', () => {
    const result = paginate(['a', 'b', 'c', 'd'], 1, 2);
    expect(result).toEqual({
      items: ['b', 'c'],
      pagination: { offset: 1, limit: 2, total: 4, hasMore: true },
    });
  });

  it('handles offset at exactly the last item', () => {
    const result = paginate([10, 20, 30], 2, 5);
    expect(result).toEqual({
      items: [30],
      pagination: { offset: 2, limit: 5, total: 3, hasMore: false },
    });
  });

  it('handles limit of 1 for single-item pages', () => {
    const result = paginate([10, 20, 30], 0, 1);
    expect(result).toEqual({
      items: [10],
      pagination: { offset: 0, limit: 1, total: 3, hasMore: true },
    });
  });

  it('sets hasMore true when limit is 0 but items exist', () => {
    const result = paginate([1, 2, 3], 0, 0);
    expect(result).toEqual({
      items: [],
      pagination: { offset: 0, limit: 0, total: 3, hasMore: true },
    });
  });

  it('sets hasMore false when limit is 0 and array is empty', () => {
    const result = paginate([], 0, 0);
    expect(result).toEqual({
      items: [],
      pagination: { offset: 0, limit: 0, total: 0, hasMore: false },
    });
  });

  it('sets hasMore false when limit is 0 and offset is beyond array length', () => {
    const result = paginate([1, 2], 5, 0);
    expect(result).toEqual({
      items: [],
      pagination: { offset: 5, limit: 0, total: 2, hasMore: false },
    });
  });

  it('is re-exported from the compaction barrel', async () => {
    const barrel = await import('../../src/compaction/index');
    expect(barrel.paginate).toBe(paginate);
  });
});
