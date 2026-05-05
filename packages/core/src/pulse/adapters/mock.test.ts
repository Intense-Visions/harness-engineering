import { describe, it, expect, beforeEach } from 'vitest';
import { clearPulseAdapters, getPulseAdapter } from './registry';
import { registerMockAdapter, MOCK_ADAPTER_NAME } from './mock';
import { assertSanitized } from '../sanitize';

describe('mock adapter', () => {
  beforeEach(() => {
    clearPulseAdapters();
  });

  it('registers under name "mock"', () => {
    registerMockAdapter();
    const adapter = getPulseAdapter(MOCK_ADAPTER_NAME);
    expect(adapter).toBeDefined();
    expect(typeof adapter?.query).toBe('function');
    expect(typeof adapter?.sanitize).toBe('function');
  });

  it('query returns canned data with allowlisted fields only', async () => {
    registerMockAdapter();
    const adapter = getPulseAdapter('mock')!;
    const w = {
      start: new Date('2026-05-04T00:00:00Z'),
      end: new Date('2026-05-05T00:00:00Z'),
    };
    const raw = await adapter.query(w);
    expect(raw).toMatchObject({
      event_name: expect.any(String),
      count: expect.any(Number),
      timestamp_bucket: expect.any(String),
    });
  });

  it('sanitize drops PII denylisted fields and emits a SanitizedResult', () => {
    registerMockAdapter();
    const adapter = getPulseAdapter('mock')!;
    const dirty = {
      event_name: 'click',
      count: 5,
      email: 'x@y.com',
      user_id: 'u123',
    };
    const sanitized = adapter.sanitize(dirty);
    // SanitizedResult shape: { fields, distributions } with allowlisted-only fields
    expect(sanitized.fields).not.toHaveProperty('email');
    expect(sanitized.fields).not.toHaveProperty('user_id');
    expect(sanitized.fields).toHaveProperty('count', 5);
    expect(sanitized.fields).toHaveProperty('event_name', 'click');
    // Throws if any PII slipped through
    assertSanitized(sanitized);
  });

  it('sanitize drops fields not on the allowlist', () => {
    registerMockAdapter();
    const adapter = getPulseAdapter('mock')!;
    const sanitized = adapter.sanitize({
      event_name: 'click',
      latency_ms: 42,
      mystery_field: 'should-be-dropped',
    });
    expect(sanitized.fields).toHaveProperty('event_name', 'click');
    expect(sanitized.fields).toHaveProperty('latency_ms', 42);
    expect(sanitized.fields).not.toHaveProperty('mystery_field');
    assertSanitized(sanitized);
  });
});
