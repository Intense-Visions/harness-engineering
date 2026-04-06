import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GatherCache } from '../../src/server/gather-cache';

describe('GatherCache', () => {
  let cache: GatherCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new GatherCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hasRun returns false for unknown key', () => {
    expect(cache.hasRun('security')).toBe(false);
  });

  it('lastRunTime returns null for unknown key', () => {
    expect(cache.lastRunTime('security')).toBeNull();
  });

  it('run executes the gather function and caches the result', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ valid: true });
    const result = await cache.run('security', gatherFn);
    expect(result).toEqual({ valid: true });
    expect(gatherFn).toHaveBeenCalledTimes(1);
    expect(cache.hasRun('security')).toBe(true);
    expect(cache.lastRunTime('security')).toBeTypeOf('number');
  });

  it('run returns cached result on second call without re-executing', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ valid: true });
    await cache.run('security', gatherFn);
    const result = await cache.run('security', gatherFn);
    expect(result).toEqual({ valid: true });
    expect(gatherFn).toHaveBeenCalledTimes(1);
  });

  it('refresh re-executes and updates the cache', async () => {
    const gatherFn1 = vi.fn().mockResolvedValue({ valid: true });
    const gatherFn2 = vi.fn().mockResolvedValue({ valid: false });
    await cache.run('security', gatherFn1);
    vi.advanceTimersByTime(5000);
    const result = await cache.refresh('security', gatherFn2);
    expect(result).toEqual({ valid: false });
    expect(gatherFn2).toHaveBeenCalledTimes(1);
  });

  it('refresh works on a key that has never been run', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ data: 'fresh' });
    const result = await cache.refresh('perf', gatherFn);
    expect(result).toEqual({ data: 'fresh' });
    expect(cache.hasRun('perf')).toBe(true);
  });

  it('get returns null for unknown key', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('get returns cached data after run', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ valid: true });
    await cache.run('security', gatherFn);
    expect(cache.get('security')).toEqual({ valid: true });
  });

  it('lastRunTime updates after refresh', async () => {
    const gatherFn = vi.fn().mockResolvedValue({ valid: true });
    await cache.run('security', gatherFn);
    const firstTime = cache.lastRunTime('security');
    vi.advanceTimersByTime(10_000);
    await cache.refresh('security', gatherFn);
    const secondTime = cache.lastRunTime('security');
    expect(secondTime).toBeGreaterThan(firstTime!);
  });
});
