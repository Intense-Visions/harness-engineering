import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SignalProvider, SignalResult } from '../src/types';

function fakeResult(id: SignalResult['id'], status: SignalResult['status'] = 'ok'): SignalResult {
  return {
    id,
    label: id,
    value: status === 'ok' ? 1 : null,
    unit: 'count',
    trend: 'flat',
    betterDirection: 'down',
    status,
    threshold: { warn: 1, alert: 3 },
    history: [],
    detail: `fake ${id}`,
    source: 'test',
  };
}

const okProvider = (id: SignalResult['id']): SignalProvider => ({
  id,
  label: id,
  compute: vi.fn(async () => fakeResult(id)),
});

const throwingProvider = (id: SignalResult['id']): SignalProvider => ({
  id,
  label: id,
  compute: vi.fn(async () => {
    throw new Error('boom');
  }),
});

// Default registry: all five OK. Individual tests override via vi.doMock + dynamic import.
vi.mock('../src/registry', () => ({
  signalRegistry: [
    okProvider('pr-merged-without-multi-persona-review'),
    okProvider('coverage-trend-down-30d'),
    okProvider('complexity-trend-up-30d'),
    okProvider('baseline-auto-update-count'),
    okProvider('eval-fail-rate'),
  ],
}));

// GraphStore best-effort load: resolve as "loaded" so graphStore is passed.
vi.mock('@harness-engineering/graph', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/graph')>(
    '@harness-engineering/graph'
  );
  return {
    ...actual,
    GraphStore: class {
      load = vi.fn(async () => true);
      findNodes = vi.fn(() => []);
    },
  };
});

describe('gatherSignals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all five signals in registry order', async () => {
    const { gatherSignals } = await import('../src/gather');
    const result = await gatherSignals('/fake');
    expect(result.signals).toHaveLength(5);
    expect(result.signals.map((s) => s.id)).toEqual([
      'pr-merged-without-multi-persona-review',
      'coverage-trend-down-30d',
      'complexity-trend-up-30d',
      'baseline-auto-update-count',
      'eval-fail-rate',
    ]);
    expect(typeof result.generatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });

  it('isolates a throwing provider as a single error card; the other four still return', async () => {
    vi.resetModules();
    vi.doMock('../src/registry', () => ({
      signalRegistry: [
        okProvider('pr-merged-without-multi-persona-review'),
        throwingProvider('coverage-trend-down-30d'),
        okProvider('complexity-trend-up-30d'),
        okProvider('baseline-auto-update-count'),
        okProvider('eval-fail-rate'),
      ],
    }));
    const { gatherSignals } = await import('../src/gather');
    const result = await gatherSignals('/fake');
    expect(result.signals).toHaveLength(5);
    const coverage = result.signals.find((s) => s.id === 'coverage-trend-down-30d')!;
    expect(coverage.status).toBe('error');
    expect(coverage.value).toBeNull();
    expect(coverage.history).toEqual([]);
    expect(coverage.detail).toContain('boom');
    // Other four unaffected
    expect(result.signals.filter((s) => s.status === 'ok')).toHaveLength(4);
  });
});
