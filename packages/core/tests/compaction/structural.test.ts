import { describe, it, expect } from 'vitest';
import { StructuralStrategy } from '../../src/compaction/strategies/structural';

describe('StructuralStrategy', () => {
  const strategy = new StructuralStrategy();

  it('has name "structural" and lossy false', () => {
    expect(strategy.name).toBe('structural');
    expect(strategy.lossy).toBe(false);
  });

  it('removes null and undefined fields from JSON objects', () => {
    const input = JSON.stringify({ a: 1, b: null, c: undefined, d: 'keep' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ a: 1, d: 'keep' });
    expect('b' in parsed).toBe(false);
  });

  it('removes empty string fields', () => {
    const input = JSON.stringify({ a: 'value', b: '' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ a: 'value' });
  });

  it('removes empty array fields', () => {
    const input = JSON.stringify({ items: [], name: 'test' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ name: 'test' });
  });

  it('removes empty object fields', () => {
    const input = JSON.stringify({ meta: {}, name: 'test' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ name: 'test' });
  });

  it('collapses single-item arrays to scalar values', () => {
    const input = JSON.stringify({ tags: ['only-one'], name: 'test' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed.tags).toBe('only-one');
  });

  it('does not collapse multi-item arrays', () => {
    const input = JSON.stringify({ tags: ['a', 'b'] });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.tags)).toBe(true);
    expect(parsed.tags).toHaveLength(2);
  });

  it('strips redundant whitespace from string values', () => {
    const input = JSON.stringify({ text: '  hello   world  ' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed.text).toBe('hello world');
  });

  it('returns non-JSON strings unchanged', () => {
    const plain = 'just plain text content here';
    expect(strategy.apply(plain)).toBe(plain);
  });

  it('normalizes pretty-printed JSON to compact form', () => {
    const pretty = JSON.stringify({ a: 1, b: 2 }, null, 2);
    const result = strategy.apply(pretty);
    expect(() => JSON.parse(result)).not.toThrow();
    // Compact form: no newlines in output
    expect(result.includes('\n')).toBe(false);
  });

  it('returns a string (not undefined) when input is JSON null', () => {
    // cleanValue(null) returns undefined; JSON.stringify(undefined) returns JS undefined
    // apply() must always return string — guard ensures '' rather than undefined
    const result = strategy.apply('null');
    expect(typeof result).toBe('string');
    expect(result).toBe('');
  });

  it('returns a string (not undefined) when all fields prune to empty', () => {
    // cleanRecord returns undefined when every field is pruned; propagates to apply()
    const result = strategy.apply('{"a":null}');
    expect(typeof result).toBe('string');
    expect(result).toBe('');
  });
});
