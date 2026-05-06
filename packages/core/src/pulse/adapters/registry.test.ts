import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPulseAdapter,
  getPulseAdapter,
  listPulseAdapters,
  clearPulseAdapters,
  PulseAdapterAlreadyRegisteredError,
} from './registry';
import type { PulseAdapter, PulseWindow } from '@harness-engineering/types';

const noopQuery: PulseAdapter['query'] = async (_w: PulseWindow) => ({});
const noopSanitize: PulseAdapter['sanitize'] = () => ({
  fields: {},
  distributions: {},
});
const noopAdapter: PulseAdapter = { query: noopQuery, sanitize: noopSanitize };

describe('pulse adapter registry', () => {
  beforeEach(() => clearPulseAdapters());

  it('register / get round-trip returns full adapter', () => {
    registerPulseAdapter('posthog', noopAdapter);
    expect(getPulseAdapter('posthog')).toBe(noopAdapter);
  });

  it('returns undefined for unknown adapters', () => {
    expect(getPulseAdapter('nope')).toBeUndefined();
  });

  it('throws when re-registering the same name', () => {
    registerPulseAdapter('sentry', noopAdapter);
    expect(() => registerPulseAdapter('sentry', noopAdapter)).toThrow(
      PulseAdapterAlreadyRegisteredError
    );
  });

  it('listPulseAdapters returns sorted names', () => {
    registerPulseAdapter('sentry', noopAdapter);
    registerPulseAdapter('posthog', noopAdapter);
    expect(listPulseAdapters()).toEqual(['posthog', 'sentry']);
  });

  it('throws TypeError when query is missing', () => {
    expect(() =>
      registerPulseAdapter('bad', { sanitize: noopSanitize } as unknown as PulseAdapter)
    ).toThrow(TypeError);
    expect(() =>
      registerPulseAdapter('bad', { sanitize: noopSanitize } as unknown as PulseAdapter)
    ).toThrow(/query/);
  });

  it('throws TypeError when sanitize is missing', () => {
    expect(() =>
      registerPulseAdapter('bad', { query: noopQuery } as unknown as PulseAdapter)
    ).toThrow(TypeError);
    expect(() =>
      registerPulseAdapter('bad', { query: noopQuery } as unknown as PulseAdapter)
    ).toThrow(/sanitize/);
  });

  it('getPulseAdapter returns the full {query, sanitize} object', () => {
    registerPulseAdapter('posthog', noopAdapter);
    const adapter = getPulseAdapter('posthog');
    expect(adapter).toBeDefined();
    expect(typeof adapter?.query).toBe('function');
    expect(typeof adapter?.sanitize).toBe('function');
  });
});
