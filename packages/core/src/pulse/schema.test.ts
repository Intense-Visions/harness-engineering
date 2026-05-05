import { describe, it, expect } from 'vitest';
import { PulseConfigSchema } from './schema';

describe('PulseConfigSchema', () => {
  const valid = {
    enabled: true,
    lookbackDefault: '24h',
    primaryEvent: 'page_view',
    valueEvent: 'value_realized',
    completionEvents: ['signup_complete'],
    qualityScoring: false,
    qualityDimension: null,
    sources: {
      analytics: 'posthog',
      tracing: 'sentry',
      payments: null,
      db: { enabled: false },
    },
    metricSourceOverrides: {},
    pendingMetrics: [],
    excludedMetrics: [],
  };

  it('parses a fully populated config', () => {
    expect(PulseConfigSchema.parse(valid)).toEqual(valid);
  });

  it('rejects wrong type for enabled', () => {
    expect(() => PulseConfigSchema.parse({ ...valid, enabled: 'yes' })).toThrow();
  });

  it('rejects unknown lookbackDefault format', () => {
    expect(() => PulseConfigSchema.parse({ ...valid, lookbackDefault: 'forever' })).toThrow();
  });

  it('accepts a config with all sources disabled', () => {
    const disabled = {
      ...valid,
      sources: { analytics: null, tracing: null, payments: null, db: { enabled: false } },
    };
    expect(PulseConfigSchema.parse(disabled)).toEqual(disabled);
  });
});
