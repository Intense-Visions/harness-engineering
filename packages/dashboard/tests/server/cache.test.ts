import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataCache } from '../../src/server/cache';

describe('DataCache', () => {
  let cache: DataCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new DataCache(60_000); // 60s TTL
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for unknown key', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    cache.set('key', { foo: 'bar' });
    const entry = cache.get<{ foo: string }>('key');
    expect(entry).not.toBeNull();
    expect(entry!.data).toEqual({ foo: 'bar' });
    expect(entry!.timestamp).toBeTypeOf('number');
  });

  it('returns null for expired entry', () => {
    cache.set('key', { foo: 'bar' });
    vi.advanceTimersByTime(61_000);
    expect(cache.get('key')).toBeNull();
  });

  it('returns entry before TTL expires', () => {
    cache.set('key', { foo: 'bar' });
    vi.advanceTimersByTime(59_000);
    expect(cache.get('key')).not.toBeNull();
  });

  it('invalidates a specific key', () => {
    cache.set('key', { foo: 'bar' });
    cache.invalidate('key');
    expect(cache.get('key')).toBeNull();
  });

  it('clears all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });
});
