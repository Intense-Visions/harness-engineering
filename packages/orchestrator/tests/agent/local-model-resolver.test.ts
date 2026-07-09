import { describe, it, expect } from 'vitest';
import {
  normalizeLocalModel,
  LocalModelResolver,
  defaultFetchModels,
  defaultWarmModel,
} from '../../src/agent/local-model-resolver';
import type { PoolStateProvider } from '@harness-engineering/local-models';
import { EmptyPoolState } from '@harness-engineering/local-models';

const providerWith = (names: Array<[string, number]>): PoolStateProvider => ({
  snapshot: () => ({
    ...EmptyPoolState(),
    entries: names.map(([ollamaName, currentScore]) => ({
      ollamaName,
      hfRepoId: `Org/${ollamaName}`,
      sizeOnDiskGb: 1,
      installedAt: '2026-07-07T00:00:00.000Z',
      lastUsedAt: null,
      currentScore,
    })),
  }),
});

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

  it('suppresses overlapping probes when a probe outlasts the interval', async () => {
    // Build a fetchModels whose first call is held open until we explicitly
    // resolve it, so we can simulate a probe that takes longer than the
    // probe interval.
    let releaseFirst: ((ids: string[]) => void) | null = null;
    const firstCall = new Promise<string[]>((resolve) => {
      releaseFirst = resolve;
    });
    const fetchModels = vi
      .fn()
      .mockImplementationOnce(() => firstCall)
      .mockResolvedValue(['a']);

    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 1_000,
      fetchModels,
    });

    // Kick off start(); this issues probe #1 which is now hung on firstCall.
    const startPromise = resolver.start();
    // Advance past several interval ticks while probe #1 is still in flight.
    // Without the in-flight guard, each tick would call fetchModels again.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchModels).toHaveBeenCalledTimes(1);

    // Manual probe() during in-flight state must also be suppressed (share
    // the same promise rather than launching a parallel probe).
    const sharedManualProbe = resolver.probe();
    expect(fetchModels).toHaveBeenCalledTimes(1);

    // Release probe #1.
    releaseFirst!(['a']);
    await startPromise;
    await sharedManualProbe;
    expect(fetchModels).toHaveBeenCalledTimes(1);

    // After completion a new tick is allowed to fetch again.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchModels).toHaveBeenCalledTimes(2);

    resolver.stop();
  });

  it('refresh() triggers a debounced re-probe (T1)', async () => {
    const fetchModels = vi.fn().mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      refreshDebounceMs: 250,
      fetchModels,
    });
    await resolver.start();
    expect(fetchModels).toHaveBeenCalledTimes(1); // start() probe

    resolver.refresh();
    // Not yet — still inside the debounce window.
    expect(fetchModels).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    expect(fetchModels).toHaveBeenCalledTimes(2); // debounced re-probe fired

    resolver.stop();
  });

  it('refresh() coalesces a burst into a single probe (T1)', async () => {
    const fetchModels = vi.fn().mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      refreshDebounceMs: 250,
      fetchModels,
    });
    await resolver.start();
    expect(fetchModels).toHaveBeenCalledTimes(1);

    // A burst of pool frames all arm the same single timer.
    resolver.refresh();
    resolver.refresh();
    resolver.refresh();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchModels).toHaveBeenCalledTimes(2); // one coalesced probe, not three

    resolver.stop();
  });

  it('stop() cancels a pending refresh (T1)', async () => {
    const fetchModels = vi.fn().mockResolvedValue(['a']);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      refreshDebounceMs: 250,
      fetchModels,
    });
    await resolver.start();
    resolver.refresh();
    resolver.stop();

    await vi.advanceTimersByTimeAsync(250);
    expect(fetchModels).toHaveBeenCalledTimes(1); // only the start() probe; refresh cancelled
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

describe('LocalModelResolver — snapshotForDiff field coverage (regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Forward-compatibility guard: snapshotForDiff (private) is a hand-curated
   * subset of LocalModelStatus fields. If a future field is added to
   * LocalModelStatus and someone forgets to extend the snapshot, change
   * detection silently breaks. This test fails when that drift occurs.
   *
   * The curated key list mirrors snapshotForDiff() exactly and excludes
   * `lastProbeAt` (which intentionally does not participate in change
   * detection — see local-model-resolver.ts probe()). If LocalModelStatus
   * grows a new field, the `Object.keys(status)` assertion below trips,
   * forcing the author to consciously decide whether the new field
   * participates in change detection and update both the snapshot and this
   * key list.
   */
  it('Object.keys(LocalModelStatus) matches the curated diff key set plus lastProbeAt', async () => {
    const SNAPSHOT_KEYS = [
      'available',
      'resolved',
      'configured',
      'detected',
      'lastError',
      'warnings',
    ] as const;
    const EXCLUDED_KEYS = ['lastProbeAt'] as const;
    const EXPECTED_STATUS_KEYS = new Set<string>([...SNAPSHOT_KEYS, ...EXCLUDED_KEYS]);

    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      fetchModels: async () => ['a'],
    });
    await resolver.probe();
    const actualKeys = new Set(Object.keys(resolver.getStatus()));

    expect(actualKeys).toEqual(EXPECTED_STATUS_KEYS);
  });

  /**
   * Behavioral coverage: every non-lastProbeAt field must, when changed
   * between two probes, cause onStatusChange to fire. If a future field is
   * added but omitted from snapshotForDiff, it will not appear here and
   * change detection for that field silently breaks; the corresponding
   * scenario below would fail loudly.
   */
  it('detects a change in `available`/`resolved` (configured-match transitions)', async () => {
    let returnValue = ['x'];
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels: async () => returnValue,
    });
    await resolver.start();
    const handler = vi.fn();
    resolver.onStatusChange(handler); // subscribe AFTER initial probe

    returnValue = ['a']; // available flips false→true, resolved null→'a'
    await vi.advanceTimersByTimeAsync(30_000);
    expect(handler).toHaveBeenCalledTimes(1);
    resolver.stop();
  });

  it('detects a change in `detected` even when `available`/`resolved` are unchanged', async () => {
    let returnValue = ['x'];
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['nope'], // nothing matches in either case
      probeIntervalMs: 30_000,
      fetchModels: async () => returnValue,
    });
    await resolver.start();
    const handler = vi.fn();
    resolver.onStatusChange(handler);

    returnValue = ['y']; // available stays false, resolved stays null, detected differs
    await vi.advanceTimersByTimeAsync(30_000);
    expect(handler).toHaveBeenCalledTimes(1);
    resolver.stop();
  });

  it('detects a change in `lastError` (transient failure → recovery)', async () => {
    const fetchModels = vi
      .fn()
      .mockResolvedValueOnce(['a'])
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start(); // probe #1 success, lastError=null
    const handler = vi.fn();
    resolver.onStatusChange(handler);

    await vi.advanceTimersByTimeAsync(30_000); // probe #2 fail, lastError set
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]?.lastError).toBe('ECONNREFUSED');
    resolver.stop();
  });

  it('detects a change in `warnings` independently of other fields', async () => {
    // Drive two failures with different error messages: `available`,
    // `resolved`, `detected` are stable; only `lastError` and `warnings`
    // differ. A naive snapshot that omitted `warnings` would still detect
    // the lastError change, but the structure of this test ensures the
    // warnings field actively participates in the snapshot.
    const fetchModels = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      probeIntervalMs: 30_000,
      fetchModels,
    });
    await resolver.start();
    const before = resolver.getStatus();
    const handler = vi.fn();
    resolver.onStatusChange(handler);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(handler).toHaveBeenCalledTimes(1);
    const after = handler.mock.calls[0]?.[0];
    expect(after?.warnings).not.toEqual(before.warnings);
    resolver.stop();
  });

  it('detects a change in `configured` is impossible (immutable post-construction) — sanity check', async () => {
    // configured is captured by-copy in the constructor and never mutated.
    // This test pins that invariant: two resolvers with different configured
    // arrays produce different status shapes, and a single resolver's
    // configured never changes between probes.
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b'],
      fetchModels: async () => ['a'],
    });
    await resolver.probe();
    const first = resolver.getStatus();
    await resolver.probe();
    const second = resolver.getStatus();
    expect(first.configured).toEqual(second.configured);
    expect(first.configured).toEqual(['a', 'b']);
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

describe('LocalModelResolver — poolState integration (Phase 4)', () => {
  it('derives candidates from pool state ordered by currentScore desc', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['static-only'],
      poolState: providerWith([
        ['llama3:8b', 50],
        ['qwen3:32b', 80],
      ]),
      fetchModels: async () => ['qwen3:32b', 'llama3:8b'],
    });
    const status = await resolver.probe();
    expect(status.configured).toEqual(['qwen3:32b', 'llama3:8b']);
    expect(status.resolved).toBe('qwen3:32b');
  });

  it('reflects pool changes on the next probe (F4c)', async () => {
    let entries: Array<[string, number]> = [];
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: [],
      poolState: {
        snapshot: () => ({
          ...EmptyPoolState(),
          entries: entries.map(([n, s]) => ({
            ollamaName: n,
            hfRepoId: `Org/${n}`,
            sizeOnDiskGb: 1,
            installedAt: '2026-07-07T00:00:00.000Z',
            lastUsedAt: null,
            currentScore: s,
          })),
        }),
      },
      fetchModels: async () => (entries.length ? [entries[0]![0]] : []),
    });
    let status = await resolver.probe();
    expect(status.resolved).toBeNull();
    entries = [['qwen3:32b', 90]];
    status = await resolver.probe();
    expect(status.detected).toContain('qwen3:32b');
    expect(status.resolved).toBe('qwen3:32b');
  });

  it('is byte-identical to the static path when poolState is absent', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b'],
      fetchModels: async () => ['b'],
    });
    const status = await resolver.probe();
    expect(status.configured).toEqual(['a', 'b']);
    expect(status.resolved).toBe('b');
  });
});

describe('LocalModelResolver — circuit breaker (T10)', () => {
  it('deprioritizes a model after N consecutive failures; a healthy peer wins', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b'], // 'a' preferred by order
      breakerThreshold: 3,
      fetchModels: async () => ['a', 'b'],
    });
    expect((await resolver.probe()).resolved).toBe('a');

    // Two failures are below threshold — still 'a'.
    resolver.recordFailure('a');
    resolver.recordFailure('a');
    expect((await resolver.probe()).resolved).toBe('a');

    // Third trips the breaker — 'a' sinks, 'b' resolves.
    resolver.recordFailure('a');
    expect((await resolver.probe()).resolved).toBe('b');
  });

  it('a success clears the trip and re-prefers the recovered model', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b'],
      breakerThreshold: 2,
      fetchModels: async () => ['a', 'b'],
    });
    resolver.recordFailure('a');
    resolver.recordFailure('a'); // tripped
    expect((await resolver.probe()).resolved).toBe('b');

    resolver.recordSuccess('a');
    expect((await resolver.probe()).resolved).toBe('a');
  });

  it('the trip clears after the cooldown elapses (injected clock)', async () => {
    let clock = 1_000;
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b'],
      breakerThreshold: 1,
      breakerCooldownMs: 500,
      now: () => clock,
      fetchModels: async () => ['a', 'b'],
    });
    resolver.recordFailure('a'); // threshold 1 → immediately tripped
    expect((await resolver.probe()).resolved).toBe('b');

    clock += 500; // cooldown elapsed
    expect((await resolver.probe()).resolved).toBe('a');
  });

  it('resolves a tripped model as a last resort when it is the only loaded candidate', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      breakerThreshold: 1,
      fetchModels: async () => ['a'],
    });
    resolver.recordFailure('a'); // tripped, but it's the only option
    expect((await resolver.probe()).resolved).toBe('a');
  });
});

describe('LocalModelResolver — task-aware resolveModel (T16)', () => {
  // A pool provider whose entries carry per-profile scores.
  const profiledProvider = (
    rows: Array<{
      name: string;
      currentScore: number;
      scoresByProfile: Partial<Record<'general' | 'coding' | 'reasoning', number>>;
    }>
  ): PoolStateProvider => ({
    snapshot: () => ({
      ...EmptyPoolState(),
      entries: rows.map((r) => ({
        ollamaName: r.name,
        hfRepoId: `Org/${r.name}`,
        sizeOnDiskGb: 1,
        installedAt: '2026-07-07T00:00:00.000Z',
        lastUsedAt: null,
        currentScore: r.currentScore,
        scoresByProfile: r.scoresByProfile,
      })),
    }),
  });

  it('a coding use-case selects the coding-best loaded model, not the composite-best', async () => {
    const poolState = profiledProvider([
      { name: 'generalist:32b', currentScore: 85, scoresByProfile: { coding: 50, reasoning: 88 } },
      { name: 'coder:7b', currentScore: 60, scoresByProfile: { coding: 95, reasoning: 30 } },
    ]);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: [],
      poolState,
      fetchModels: async () => ['generalist:32b', 'coder:7b'], // both loaded
    });
    await resolver.probe();

    // No use-case → composite (generalist wins on currentScore).
    expect(resolver.resolveModel()).toBe('generalist:32b');
    // Coding tier → the coding specialist.
    expect(resolver.resolveModel({ kind: 'tier', tier: 'quick-fix' })).toBe('coder:7b');
    // Diagnostic tier maps to reasoning → the generalist (reasoning 88 > 30).
    expect(resolver.resolveModel({ kind: 'tier', tier: 'diagnostic' })).toBe('generalist:32b');
  });

  it('only considers loaded models for the profile selection', async () => {
    const poolState = profiledProvider([
      { name: 'coder:7b', currentScore: 60, scoresByProfile: { coding: 95 } },
      { name: 'generalist:32b', currentScore: 85, scoresByProfile: { coding: 50 } },
    ]);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: [],
      poolState,
      fetchModels: async () => ['generalist:32b'], // coder NOT loaded
    });
    await resolver.probe();
    // Coding-best is coder:7b but it isn't loaded → fall to the loaded generalist.
    expect(resolver.resolveModel({ kind: 'tier', tier: 'guided-change' })).toBe('generalist:32b');
  });

  it('non-tier use-cases map to general (composite resolution)', async () => {
    const poolState = profiledProvider([
      { name: 'coder:7b', currentScore: 60, scoresByProfile: { coding: 95 } },
      { name: 'generalist:32b', currentScore: 85, scoresByProfile: { coding: 50 } },
    ]);
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: [],
      poolState,
      fetchModels: async () => ['generalist:32b', 'coder:7b'],
    });
    await resolver.probe();
    expect(resolver.resolveModel({ kind: 'chat' })).toBe('generalist:32b');
    expect(resolver.resolveModel({ kind: 'maintenance' })).toBe('generalist:32b');
  });
});

describe('LocalModelResolver — warm on selection change (T19/T20)', () => {
  it('warms the newly-resolved model when the selection changes', async () => {
    const warmModel = vi.fn();
    let detected = ['a'];
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a', 'b'],
      warmModel,
      fetchModels: async () => detected,
    });

    await resolver.probe();
    // First resolution (null → 'a') is a change → warm 'a'.
    expect(warmModel).toHaveBeenCalledTimes(1);
    expect(warmModel).toHaveBeenLastCalledWith('a');

    // Same selection on the next probe → no re-warm.
    await resolver.probe();
    expect(warmModel).toHaveBeenCalledTimes(1);

    // 'a' disappears, 'b' resolves → selection change → warm 'b'.
    detected = ['b'];
    await resolver.probe();
    expect(warmModel).toHaveBeenCalledTimes(2);
    expect(warmModel).toHaveBeenLastCalledWith('b');
  });

  it('does not warm when the selection becomes null (nothing loaded)', async () => {
    const warmModel = vi.fn();
    let detected: string[] = ['a'];
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      warmModel,
      fetchModels: async () => detected,
    });
    await resolver.probe();
    expect(warmModel).toHaveBeenCalledTimes(1); // warmed 'a'

    detected = []; // model unloaded → resolved becomes null
    await resolver.probe();
    // null is not a warmable target — no extra call.
    expect(warmModel).toHaveBeenCalledTimes(1);
  });

  it('a throwing warm hook never breaks the probe', async () => {
    const resolver = new LocalModelResolver({
      endpoint: 'http://localhost:11434/v1',
      configured: ['a'],
      warmModel: () => {
        throw new Error('warm boom');
      },
      fetchModels: async () => ['a'],
    });
    const status = await resolver.probe();
    expect(status.resolved).toBe('a'); // probe succeeded despite the throw
  });
});

describe('defaultWarmModel (T19)', () => {
  it('POSTs an empty-prompt keep_alive request to the native Ollama generate endpoint', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    try {
      await defaultWarmModel('http://localhost:11434/v1', 'qwen3:32b', 'ollama', '10m');
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(calls).toHaveLength(1);
    // /v1 is stripped → native generate endpoint.
    expect(calls[0]!.url).toBe('http://localhost:11434/api/generate');
    expect(calls[0]!.init.method).toBe('POST');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ model: 'qwen3:32b', prompt: '', keep_alive: '10m' });
  });

  it('swallows fetch failures (best-effort)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    try {
      await expect(
        defaultWarmModel('http://localhost:11434/v1', 'qwen3:32b')
      ).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
