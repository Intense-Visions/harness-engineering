import { describe, expect, it } from 'vitest';
import { DEFAULT_GRAPH_DETAIL_CEILING, boundItems } from './detail-ceiling';

describe('boundItems', () => {
  it('passes through an array below the ceiling unchanged', () => {
    const input = [1, 2, 3];
    const result = boundItems(input, 10);
    expect(result.items).toEqual([1, 2, 3]);
    expect(result.truncated).toBe(false);
    expect(result.totalAvailable).toBe(3);
    expect(result.returned).toBe(3);
  });

  it('truncates an array above the ceiling and flags truncated', () => {
    const input = Array.from({ length: 500 }, (_, i) => i);
    const result = boundItems(input, 200);
    expect(result.items).toHaveLength(200);
    expect(result.items[0]).toBe(0);
    expect(result.items[199]).toBe(199);
    expect(result.truncated).toBe(true);
    expect(result.totalAvailable).toBe(500);
    expect(result.returned).toBe(200);
  });

  it('applies the default ceiling when none is provided', () => {
    const input = Array.from({ length: DEFAULT_GRAPH_DETAIL_CEILING + 50 }, (_, i) => i);
    const result = boundItems(input);
    expect(result.items).toHaveLength(DEFAULT_GRAPH_DETAIL_CEILING);
    expect(result.truncated).toBe(true);
    expect(result.totalAvailable).toBe(DEFAULT_GRAPH_DETAIL_CEILING + 50);
  });

  it('falls back to the default ceiling for a non-positive ceiling', () => {
    const input = Array.from({ length: DEFAULT_GRAPH_DETAIL_CEILING + 1 }, (_, i) => i);
    expect(boundItems(input, 0).items).toHaveLength(DEFAULT_GRAPH_DETAIL_CEILING);
    expect(boundItems(input, -5).items).toHaveLength(DEFAULT_GRAPH_DETAIL_CEILING);
    expect(boundItems(input, Number.NaN).items).toHaveLength(DEFAULT_GRAPH_DETAIL_CEILING);
  });

  it('handles an empty array', () => {
    const result = boundItems([], 200);
    expect(result.items).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.totalAvailable).toBe(0);
    expect(result.returned).toBe(0);
  });

  it('does not mutate or alias the input array', () => {
    const input = [1, 2, 3];
    const result = boundItems(input, 10);
    expect(result.items).not.toBe(input);
    result.items.push(4);
    expect(input).toEqual([1, 2, 3]);
  });
});
