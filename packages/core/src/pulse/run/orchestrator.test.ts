import { describe, it, expect, beforeEach } from 'vitest';
import { runPulse } from './orchestrator';
import { clearPulseAdapters, registerPulseAdapter } from '../adapters/registry';
import { computeWindow } from './window';
import type { PulseConfig, SanitizedResult } from '@harness-engineering/types';

const baseConfig: PulseConfig = {
  enabled: true,
  lookbackDefault: '24h',
  primaryEvent: 'click',
  valueEvent: 'value',
  completionEvents: [],
  qualityScoring: false,
  qualityDimension: null,
  sources: { analytics: 'mock', tracing: null, payments: null, db: { enabled: false } },
  metricSourceOverrides: {},
  pendingMetrics: [],
  excludedMetrics: [],
};

const cleanResult = (event: string): SanitizedResult => ({
  fields: { event_name: event, count: 1 },
  distributions: {},
});

describe('runPulse orchestrator', () => {
  beforeEach(() => clearPulseAdapters());

  it('queries registered adapters and returns sanitized results', async () => {
    let queried = false;
    registerPulseAdapter('mock', {
      query: async () => {
        queried = true;
        return { event_name: 'x', count: 1 };
      },
      sanitize: () => cleanResult('x'),
    });
    const window = computeWindow(new Date('2026-05-05T12:00:00Z'), '24h');
    const result = await runPulse(
      { ...baseConfig, sources: { ...baseConfig.sources, analytics: 'mock' } },
      window
    );
    expect(queried).toBe(true);
    expect(result.sourcesQueried).toContain('mock');
    expect(result.sources).toHaveLength(1);
  });

  it('skips source with missing adapter and tags skipKind=no-adapter', async () => {
    const window = computeWindow(new Date(), '24h');
    const result = await runPulse(
      { ...baseConfig, sources: { ...baseConfig.sources, analytics: 'unregistered' } },
      window
    );
    const skip = result.sourcesSkipped.find((s) => s.name === 'unregistered');
    expect(skip).toBeDefined();
    expect(skip?.skipKind).toBe('no-adapter');
    expect(skip?.kind).toBe('analytics');
    expect(result.sourcesQueried).not.toContain('unregistered');
  });

  it('skips source whose sanitize emits PII and tags skipKind=pii-violation', async () => {
    registerPulseAdapter('leaky', {
      query: async () => ({ email: 'x@y.com' }),
      // Intentionally bad: passes a non-SanitizedResult through.
      sanitize: () =>
        ({ fields: { email: 'x@y.com' }, distributions: {} }) as unknown as SanitizedResult,
    });
    const window = computeWindow(new Date(), '24h');
    const result = await runPulse(
      { ...baseConfig, sources: { ...baseConfig.sources, analytics: 'leaky' } },
      window
    );
    const skip = result.sourcesSkipped.find((s) => s.name === 'leaky');
    expect(skip).toBeDefined();
    expect(skip?.skipKind).toBe('pii-violation');
    expect(skip?.kind).toBe('analytics');
  });

  it('skips source whose query throws and tags skipKind=query-failure', async () => {
    registerPulseAdapter('flaky', {
      query: async () => {
        throw new Error('503 Service Unavailable');
      },
      sanitize: () => cleanResult('flaky'),
    });
    const window = computeWindow(new Date(), '24h');
    const result = await runPulse(
      { ...baseConfig, sources: { ...baseConfig.sources, analytics: 'flaky' } },
      window
    );
    const skip = result.sourcesSkipped.find((s) => s.name === 'flaky');
    expect(skip).toBeDefined();
    expect(skip?.skipKind).toBe('query-failure');
    expect(skip?.reason).toContain('503');
  });

  it('runs analytics+tracing+payments in parallel; DB serial', async () => {
    const order: string[] = [];
    registerPulseAdapter('a', {
      query: async () => {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 5));
        order.push('a-end');
        return { event_name: 'a', count: 1 };
      },
      sanitize: () => cleanResult('a'),
    });
    registerPulseAdapter('t', {
      query: async () => {
        order.push('t-start');
        await new Promise((r) => setTimeout(r, 5));
        order.push('t-end');
        return { event_name: 't', count: 1 };
      },
      sanitize: () => cleanResult('t'),
    });
    registerPulseAdapter('d', {
      query: async () => {
        order.push('d-start');
        order.push('d-end');
        return { event_name: 'd', count: 1 };
      },
      sanitize: () => cleanResult('d'),
    });
    const window = computeWindow(new Date(), '24h');
    await runPulse(
      {
        ...baseConfig,
        sources: {
          analytics: 'a',
          tracing: 't',
          payments: null,
          db: { enabled: true, source: 'd' },
        },
      },
      window
    );
    // a-start and t-start both fire before either ends (parallel)
    expect(order.indexOf('a-start')).toBeLessThan(order.indexOf('t-end'));
    expect(order.indexOf('t-start')).toBeLessThan(order.indexOf('a-end'));
    // d-start fires after both a-end and t-end (serial)
    expect(order.indexOf('d-start')).toBeGreaterThan(order.indexOf('a-end'));
    expect(order.indexOf('d-start')).toBeGreaterThan(order.indexOf('t-end'));
  });

  const withDist = (event: string, dist: SanitizedResult['distributions']): SanitizedResult => ({
    fields: { event_name: event, count: 1 },
    distributions: dist,
  });

  it('omits quality when qualityScoring is disabled', async () => {
    registerPulseAdapter('mock', {
      query: async () => ({}),
      sanitize: () => withDist('x', { sentiment: { good: 3 } }),
    });
    const result = await runPulse(
      { ...baseConfig, qualityScoring: false, qualityDimension: 'sentiment' },
      computeWindow(new Date(), '24h')
    );
    expect(result.quality).toBeUndefined();
  });

  it('aggregates the configured dimension distribution across sources when enabled', async () => {
    registerPulseAdapter('a', {
      query: async () => ({}),
      sanitize: () => withDist('a', { sentiment: { good: 3, bad: 1 } }),
    });
    registerPulseAdapter('t', {
      query: async () => ({}),
      sanitize: () => withDist('t', { sentiment: { good: 2 }, other: { x: 9 } }),
    });
    const result = await runPulse(
      {
        ...baseConfig,
        qualityScoring: true,
        qualityDimension: 'sentiment',
        sources: { analytics: 'a', tracing: 't', payments: null, db: { enabled: false } },
      },
      computeWindow(new Date(), '24h')
    );
    expect(result.quality).toEqual({
      dimension: 'sentiment',
      distribution: { good: 5, bad: 1 },
      total: 6,
      sources: 2,
    });
  });

  it('returns an empty quality summary when no source reports the dimension', async () => {
    registerPulseAdapter('mock', {
      query: async () => ({}),
      sanitize: () => withDist('x', { other: { x: 1 } }),
    });
    const result = await runPulse(
      { ...baseConfig, qualityScoring: true, qualityDimension: 'sentiment' },
      computeWindow(new Date(), '24h')
    );
    expect(result.quality).toEqual({
      dimension: 'sentiment',
      distribution: {},
      total: 0,
      sources: 0,
    });
  });
});
