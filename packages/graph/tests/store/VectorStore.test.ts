import { describe, it, expect, beforeEach } from 'vitest';
import { VectorStore } from '../../src/store/VectorStore.js';

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore(3);
  });

  it('should add and search vectors — exact match first, nearest second', () => {
    store.add('a', [1, 0, 0]);
    store.add('b', [0.9, 0.1, 0]);
    store.add('c', [0, 0, 1]);

    const results = store.search([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('a');
    expect(results[0]!.score).toBeCloseTo(1);
    expect(results[1]!.id).toBe('b');
  });

  it('should return empty results for an empty store', () => {
    const results = store.search([1, 0, 0], 5);
    expect(results).toHaveLength(0);
  });

  it('should report size correctly', () => {
    expect(store.size).toBe(0);
    store.add('a', [1, 0, 0]);
    expect(store.size).toBe(1);
    store.add('b', [0, 1, 0]);
    expect(store.size).toBe(2);
  });

  it('should return all available when topK exceeds size', () => {
    store.add('a', [1, 0, 0]);
    store.add('b', [0, 1, 0]);
    const results = store.search([1, 0, 0], 10);
    expect(results).toHaveLength(2);
  });

  it('should remove a vector', () => {
    store.add('a', [1, 0, 0]);
    expect(store.has('a')).toBe(true);
    expect(store.remove('a')).toBe(true);
    expect(store.has('a')).toBe(false);
    expect(store.size).toBe(0);
  });

  it('should throw on dimension mismatch when adding', () => {
    expect(() => store.add('bad', [1, 0])).toThrow('Dimension mismatch');
  });

  it('should throw on dimension mismatch when searching', () => {
    expect(() => store.search([1, 0], 1)).toThrow('Dimension mismatch');
  });

  it('should clear all vectors', () => {
    store.add('a', [1, 0, 0]);
    store.add('b', [0, 1, 0]);
    store.clear();
    expect(store.size).toBe(0);
  });

  describe('serialize / deserialize', () => {
    it('should round-trip vectors through serialization', () => {
      store.add('a', [1, 0, 0]);
      store.add('b', [0, 1, 0]);
      store.add('c', [0, 0, 1]);

      const data = store.serialize();
      const restored = VectorStore.deserialize(data);

      expect(restored.size).toBe(3);
      expect(restored.has('a')).toBe(true);
      expect(restored.has('b')).toBe(true);
      expect(restored.has('c')).toBe(true);
    });

    it('should preserve dimensions', () => {
      const data = store.serialize();
      expect(data.dimensions).toBe(3);

      const restored = VectorStore.deserialize(data);
      // Verify dimension enforcement still works
      expect(() => restored.add('bad', [1, 0])).toThrow('Dimension mismatch');
    });

    it('should produce correct search results after deserialization', () => {
      store.add('a', [1, 0, 0]);
      store.add('b', [0.9, 0.1, 0]);
      store.add('c', [0, 0, 1]);

      const data = store.serialize();
      const restored = VectorStore.deserialize(data);

      const results = restored.search([1, 0, 0], 2);
      expect(results).toHaveLength(2);
      expect(results[0]!.id).toBe('a');
      expect(results[0]!.score).toBeCloseTo(1);
      expect(results[1]!.id).toBe('b');
    });

    it('should handle empty store', () => {
      const data = store.serialize();
      expect(data.vectors).toHaveLength(0);

      const restored = VectorStore.deserialize(data);
      expect(restored.size).toBe(0);
    });

    it('should not share references with original store', () => {
      store.add('a', [1, 0, 0]);
      const data = store.serialize();
      const restored = VectorStore.deserialize(data);

      // Mutating restored should not affect original
      restored.add('new', [0, 1, 0]);
      expect(store.size).toBe(1);
      expect(restored.size).toBe(2);
    });
  });
});
