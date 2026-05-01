import { describe, it, expect } from 'vitest';
import {
  normalizeLocalModel,
  LocalModelResolver,
  defaultFetchModels,
} from '../../src/agent/local-model-resolver';

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

describe('LocalModelResolver — error and degraded modes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('records malformed response error from a custom fetchModels (SC11b)', async () => {
    const fetchModels = vi.fn().mockRejectedValue(new Error('malformed /v1/models response'));
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      fetchModels,
    });
    await resolver.start();
    const status = resolver.getStatus();
    expect(status.available).toBe(false);
    expect(status.lastError).toBe('malformed /v1/models response');
    resolver.stop();
  });

  it('continues probing after a failure (SC11)', async () => {
    const fetchModels = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(['a'])
      .mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start();
    expect(resolver.getStatus().available).toBe(false);
    expect(resolver.getStatus().lastError).toBe('ECONNREFUSED');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchModels).toHaveBeenCalledTimes(2);
    expect(resolver.getStatus().available).toBe(true);
    expect(resolver.getStatus().lastError).toBeNull();

    resolver.stop();
  });

  it('preserves prior detected list across a transient failure', async () => {
    const fetchModels = vi
      .fn()
      .mockResolvedValueOnce(['a', 'b'])
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start();
    expect(resolver.getStatus().detected).toEqual(['a', 'b']);

    await vi.advanceTimersByTimeAsync(30_000);
    const after = resolver.getStatus();
    expect(after.lastError).toBe('ECONNREFUSED');
    expect(after.detected).toEqual(['a', 'b']); // retained per spec line 137
    expect(after.available).toBe(false);

    resolver.stop();
  });

  it('clamps probeIntervalMs below the 1_000ms minimum', async () => {
    const fetchModels = vi.fn().mockResolvedValue([]);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 100, // below MIN
      fetchModels,
    });
    await resolver.start();
    // Advance by 999ms — interval should not have fired (minimum is 1_000).
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchModels).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchModels).toHaveBeenCalledTimes(2);
    resolver.stop();
  });
});

describe('defaultFetchModels — wire format', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('aborts a hung fetch after the timeout and surfaces a timeout error', async () => {
    // Simulate a hung TCP connection: fetch never resolves on its own, but
    // honors the AbortSignal by rejecting with a TimeoutError when fired.
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const reason =
              (signal as AbortSignal & { reason?: unknown }).reason ??
              Object.assign(new Error('aborted'), { name: 'TimeoutError' });
            reject(reason);
          });
        }
      });
    }) as unknown as typeof fetch;

    await expect(defaultFetchModels('http://localhost:11434/v1', 'lm-studio', 50)).rejects.toThrow(
      /request timeout \(50ms\)/
    );
  });

  it('LocalModelResolver records a timeout error when default fetch is hung', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const reason =
                (signal as AbortSignal & { reason?: unknown }).reason ??
                Object.assign(new Error('aborted'), { name: 'TimeoutError' });
              reject(reason);
            });
          }
        });
      }) as unknown as typeof fetch;

      const resolver = new LocalModelResolver({
        endpoint: 'http://localhost:11434/v1',
        configured: ['a'],
        timeoutMs: 200,
        // No fetchModels override — uses the bound default with timeout.
      });
      const probePromise = resolver.probe();
      // Advance past the timeout so AbortSignal.timeout fires.
      await vi.advanceTimersByTimeAsync(250);
      const status = await probePromise;
      expect(status.available).toBe(false);
      expect(status.lastError).toMatch(/request timeout \(200ms\)/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('parses a valid /v1/models response into ID list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        data: [
          { id: 'gemma-4-e4b', object: 'model' },
          { id: 'qwen3:8b', object: 'model' },
        ],
      }),
    }) as unknown as typeof fetch;

    const ids = await defaultFetchModels('http://localhost:11434/v1', 'lm-studio');
    expect(ids).toEqual(['gemma-4-e4b', 'qwen3:8b']);
  });

  it('throws on non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    }) as unknown as typeof fetch;
    await expect(defaultFetchModels('http://localhost:11434/v1')).rejects.toThrow(/503/);
  });

  it('throws "malformed" on missing data array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ models: [] }),
    }) as unknown as typeof fetch;
    await expect(defaultFetchModels('http://localhost:11434/v1')).rejects.toThrow(/malformed/);
  });

  it('throws "malformed" on entry without id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: [{ object: 'model' }] }),
    }) as unknown as typeof fetch;
    await expect(defaultFetchModels('http://localhost:11434/v1')).rejects.toThrow(/malformed/);
  });

  it('sends Authorization: Bearer with apiKey or default', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: [] }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await defaultFetchModels('http://localhost:11434/v1', 'my-key');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:11434/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-key' }),
      })
    );

    fetchSpy.mockClear();
    await defaultFetchModels('http://localhost:11434/v1');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:11434/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer lm-studio' }),
      })
    );
  });
});
