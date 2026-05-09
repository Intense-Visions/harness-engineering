import { describe, it, expect } from 'vitest';
import { ETagStore } from '../../../src/roadmap/tracker/etag-store';

describe('ETagStore', () => {
  it('a) set+get round-trip returns { etag, data }', () => {
    const store = new ETagStore();
    store.set('feature:github:o/r#1', 'etag-1', { name: 'F1' });
    expect(store.get('feature:github:o/r#1')).toEqual({
      etag: 'etag-1',
      data: { name: 'F1' },
    });
  });

  it('b) get on missing key returns null', () => {
    const store = new ETagStore();
    expect(store.get('does:not:exist')).toBeNull();
  });

  it('c) invalidate(key) removes the entry', () => {
    const store = new ETagStore();
    store.set('k', 'e', { v: 1 });
    expect(store.get('k')).not.toBeNull();
    store.invalidate('k');
    expect(store.get('k')).toBeNull();
  });

  it('d) invalidateAll() empties the cache', () => {
    const store = new ETagStore();
    store.set('a', 'ea', 1);
    store.set('b', 'eb', 2);
    store.set('c', 'ec', 3);
    expect(store.size).toBe(3);
    store.invalidateAll();
    expect(store.size).toBe(0);
    expect(store.get('a')).toBeNull();
  });

  it('e) LRU eviction: cap=3, set 4 keys, the first one is evicted', () => {
    const store = new ETagStore(3);
    store.set('A', 'eA', 1);
    store.set('B', 'eB', 2);
    store.set('C', 'eC', 3);
    store.set('D', 'eD', 4);
    expect(store.size).toBe(3);
    expect(store.get('A')).toBeNull();
    expect(store.get('B')).not.toBeNull();
    expect(store.get('C')).not.toBeNull();
    expect(store.get('D')).not.toBeNull();
  });

  it('f) Touch on get: set A,B,C; get(A) to touch; set D; expect B (not A) evicted', () => {
    const store = new ETagStore(3);
    store.set('A', 'eA', 1);
    store.set('B', 'eB', 2);
    store.set('C', 'eC', 3);
    // Touch A — moves it to most-recent
    expect(store.get('A')).not.toBeNull();
    store.set('D', 'eD', 4);
    expect(store.size).toBe(3);
    expect(store.get('A')).not.toBeNull();
    expect(store.get('B')).toBeNull();
    expect(store.get('C')).not.toBeNull();
    expect(store.get('D')).not.toBeNull();
  });

  it('invalidatePrefix removes only matching keys', () => {
    const store = new ETagStore();
    store.set('list:all', 'e1', []);
    store.set('list:status:in-progress', 'e2', []);
    store.set('feature:github:o/r#1', 'e3', {});
    store.invalidatePrefix('list:');
    expect(store.get('list:all')).toBeNull();
    expect(store.get('list:status:in-progress')).toBeNull();
    expect(store.get('feature:github:o/r#1')).not.toBeNull();
  });
});
