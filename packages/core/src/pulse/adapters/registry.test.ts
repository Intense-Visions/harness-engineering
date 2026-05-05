import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPulseAdapter,
  getPulseAdapter,
  listPulseAdapters,
  clearPulseAdapters,
  PulseAdapterAlreadyRegisteredError,
} from './registry';
import type { SanitizeFn } from '@harness-engineering/types';

const noopAdapter: SanitizeFn = () => ({
  events: [],
  counts: {},
  bucketStart: new Date(0).toISOString(),
  bucketEnd: new Date(0).toISOString(),
});

describe('pulse adapter registry', () => {
  beforeEach(() => clearPulseAdapters());

  it('register / get round-trip', () => {
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
});
