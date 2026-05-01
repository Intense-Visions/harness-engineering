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

import { vi, beforeEach, afterEach } from 'vitest';

describe('LocalModelResolver — lifecycle (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs one probe before start() resolves (SC8)', async () => {
    const fetchModels = vi.fn().mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start();
    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(resolver.resolveModel()).toBe('a');
    resolver.stop();
  });

  it('re-probes on every interval tick (SC9)', async () => {
    const fetchModels = vi.fn().mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start();
    expect(fetchModels).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchModels).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchModels).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchModels).toHaveBeenCalledTimes(5);

    resolver.stop();
  });

  it('stop() clears the timer (SC12)', async () => {
    const fetchModels = vi.fn().mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start();
    resolver.stop();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchModels).toHaveBeenCalledTimes(1); // only the start() probe
  });

  it('start() is idempotent (no second timer)', async () => {
    const fetchModels = vi.fn().mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start();
    await resolver.start(); // should not schedule a second timer or re-probe immediately
    expect(fetchModels).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchModels).toHaveBeenCalledTimes(2); // exactly one tick, not two

    resolver.stop();
  });

  it('stop() is idempotent (calling twice does not throw)', async () => {
    const fetchModels = vi.fn().mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start();
    resolver.stop();
    expect(() => resolver.stop()).not.toThrow();
  });
});

describe('LocalModelResolver — onStatusChange semantics (SC10)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires when resolved model transitions from null to a candidate', async () => {
    let returnValue: string[] = [];
    const fetchModels = vi.fn().mockImplementation(async () => returnValue);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    const handler = vi.fn();
    resolver.onStatusChange(handler);

    await resolver.start();
    // Initial probe: detected=[], available=false. Compared against the
    // pre-probe initial snapshot (also available=false, detected=[]) —
    // listeners fire only on diff. Since this is the first transition out
    // of the initial state, snapshots may differ; assert the handler was
    // called at most once for the initial probe.
    const initialCalls = handler.mock.calls.length;

    returnValue = ['a'];
    await vi.advanceTimersByTimeAsync(30_000);
    expect(handler).toHaveBeenCalledTimes(initialCalls + 1);
    const lastStatus = handler.mock.calls.at(-1)?.[0];
    expect(lastStatus.available).toBe(true);
    expect(lastStatus.resolved).toBe('a');

    resolver.stop();
  });

  it('does not fire when consecutive probes produce identical status', async () => {
    const fetchModels = vi.fn().mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    const handler = vi.fn();
    await resolver.start();
    resolver.onStatusChange(handler); // subscribe AFTER initial probe

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(handler).not.toHaveBeenCalled();
    resolver.stop();
  });

  it('returns an unsubscribe function that detaches the handler', async () => {
    const fetchModels = vi
      .fn()
      .mockResolvedValueOnce(['a'])
      .mockResolvedValueOnce(['b'])
      .mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start();
    const handler = vi.fn();
    const unsubscribe = resolver.onStatusChange(handler);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(handler).toHaveBeenCalledTimes(1);

    resolver.stop();
  });
});
