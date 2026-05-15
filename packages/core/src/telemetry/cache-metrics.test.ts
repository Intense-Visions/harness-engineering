import { describe, it, expect } from 'vitest';
import { CacheMetricsRecorder } from './cache-metrics';

describe('CacheMetricsRecorder', () => {
  it('returns zero stats on an empty recorder', () => {
    const recorder = new CacheMetricsRecorder();
    const stats = recorder.getStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(0);
    expect(stats.byBackend).toEqual({});
    expect(stats.windowStartedAt).toBe(0);
  });

  it('computes hitRate across mixed hits and misses', () => {
    const recorder = new CacheMetricsRecorder({ now: () => 1700000000000 });
    for (let i = 0; i < 7; i++) recorder.record('anthropic', true, 0, 100);
    for (let i = 0; i < 3; i++) recorder.record('anthropic', false, 50, 0);

    const stats = recorder.getStats();
    expect(stats.totalRequests).toBe(10);
    expect(stats.hits).toBe(7);
    expect(stats.misses).toBe(3);
    expect(stats.hitRate).toBeCloseTo(0.7, 6);
    expect(stats.windowStartedAt).toBe(1700000000000);
  });

  it('evicts oldest samples when the ring buffer overflows capacity', () => {
    const recorder = new CacheMetricsRecorder({ capacity: 5 });
    // First 5 samples are misses; next 5 are hits. After overflow, only
    // the 5 hits remain in the window.
    for (let i = 0; i < 5; i++) recorder.record('anthropic', false, 0, 0);
    for (let i = 0; i < 5; i++) recorder.record('anthropic', true, 0, 50);

    const stats = recorder.getStats();
    expect(stats.totalRequests).toBe(5);
    expect(stats.hits).toBe(5);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(1);
  });

  it('breaks down hits/misses by backend', () => {
    const recorder = new CacheMetricsRecorder();
    recorder.record('anthropic', true, 0, 100);
    recorder.record('anthropic', true, 0, 100);
    recorder.record('anthropic', false, 50, 0);
    recorder.record('openai', false, 0, 0);
    recorder.record('openai', true, 0, 30);

    const stats = recorder.getStats();
    expect(stats.byBackend).toEqual({
      anthropic: { hits: 2, misses: 1 },
      openai: { hits: 1, misses: 1 },
    });
    expect(stats.totalRequests).toBe(5);
    expect(stats.hits).toBe(3);
    expect(stats.misses).toBe(2);
  });

  it('reset() clears the buffer and resets windowStartedAt to 0', () => {
    const recorder = new CacheMetricsRecorder({ now: () => 42 });
    recorder.record('anthropic', true, 0, 10);
    expect(recorder.getStats().windowStartedAt).toBe(42);

    recorder.reset();
    const stats = recorder.getStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.windowStartedAt).toBe(0);
  });
});
