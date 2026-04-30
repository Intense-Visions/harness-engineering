import { describe, it, expect } from 'vitest';
import { normalizeLocalModel, LocalModelResolver } from '../../src/agent/local-model-resolver';

describe('normalizeLocalModel', () => {
  it('returns [] when input is undefined', () => {
    expect(normalizeLocalModel(undefined)).toEqual([]);
  });

  it('wraps a string in a 1-element array', () => {
    expect(normalizeLocalModel('gemma-4-e4b')).toEqual(['gemma-4-e4b']);
  });

  it('returns the array unchanged when given a non-empty array', () => {
    expect(normalizeLocalModel(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('throws a descriptive error when given an empty array', () => {
    expect(() => normalizeLocalModel([])).toThrow(/non-empty/i);
  });
});

describe('LocalModelResolver — single probe semantics (no timer)', () => {
  it('selects the first configured candidate present in detected (SC4)', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b', 'c'],
      fetchModels: async () => ['b', 'c', 'x'],
    });
    const status = await resolver.probe();
    expect(status.available).toBe(true);
    expect(status.resolved).toBe('b');
    expect(status.detected).toEqual(['b', 'c', 'x']);
    expect(resolver.resolveModel()).toBe('b');
  });

  it('honors configured priority order (SC5)', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b', 'c'],
      fetchModels: async () => ['a', 'b', 'c'],
    });
    const status = await resolver.probe();
    expect(status.resolved).toBe('a');
  });

  it('reports unavailable with warnings when no candidate matches (SC6)', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b', 'c'],
      fetchModels: async () => ['x', 'y', 'z'],
    });
    const status = await resolver.probe();
    expect(status.available).toBe(false);
    expect(status.resolved).toBeNull();
    expect(status.detected).toEqual(['x', 'y', 'z']);
    expect(status.warnings.length).toBeGreaterThan(0);
    expect(status.warnings.join(' ')).toMatch(/a.*b.*c/);
    expect(status.warnings.join(' ')).toMatch(/x.*y.*z/);
  });

  it('treats empty detected array as unavailable but not an error (SC11c)', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      fetchModels: async () => [],
    });
    const status = await resolver.probe();
    expect(status.available).toBe(false);
    expect(status.resolved).toBeNull();
    expect(status.detected).toEqual([]);
    expect(status.lastError).toBeNull();
  });

  it('records lastError and keeps available=false on fetch failure (SC11)', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      fetchModels: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const status = await resolver.probe();
    expect(status.available).toBe(false);
    expect(status.lastError).toBe('ECONNREFUSED');
    expect(status.detected).toEqual([]); // initial empty stays empty
  });
});
