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

  it('skips source with missing adapter and records reason', async () => {
    const window = computeWindow(new Date(), '24h');
    const result = await runPulse(
      { ...baseConfig, sources: { ...baseConfig.sources, analytics: 'unregistered' } },
      window
    );
    expect(result.sourcesSkipped.find((s) => s.name === 'unregistered')).toBeDefined();
    expect(result.sourcesQueried).not.toContain('unregistered');
  });

  it('skips source whose sanitize emits PII (assertSanitized throws)', async () => {
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
    expect(result.sourcesSkipped.find((s) => s.name === 'leaky')).toBeDefined();
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
});
