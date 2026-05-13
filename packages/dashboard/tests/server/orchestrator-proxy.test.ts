import { describe, it, expect } from 'vitest';
import { formatProxyErrorMessage } from '../../src/server/orchestrator-proxy';

describe('formatProxyErrorMessage', () => {
  it('returns the base message when there is no cause', () => {
    expect(formatProxyErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('surfaces cause.message — the WHATWG bad-port case that broke #287', () => {
    // undici emits this shape: TypeError: fetch failed with cause: TypeError: bad port
    const cause = new TypeError('bad port');
    const err = new TypeError('fetch failed', { cause });
    expect(formatProxyErrorMessage(err)).toBe('fetch failed (cause: bad port)');
  });

  it('surfaces cause.code when cause is not an Error but carries a code', () => {
    const cause = { code: 'ECONNREFUSED' };
    const err = Object.assign(new TypeError('fetch failed'), { cause });
    expect(formatProxyErrorMessage(err)).toBe('fetch failed (cause: ECONNREFUSED)');
  });

  it('prefers cause.message over cause.code when both are available', () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8080'), {
      code: 'ECONNREFUSED',
    });
    const err = Object.assign(new TypeError('fetch failed'), { cause });
    expect(formatProxyErrorMessage(err)).toBe(
      'fetch failed (cause: connect ECONNREFUSED 127.0.0.1:8080)'
    );
  });

  it('falls back to String(err) when the throwable is not an Error', () => {
    expect(formatProxyErrorMessage('plain string failure')).toBe('plain string failure');
    expect(formatProxyErrorMessage(42)).toBe('42');
  });

  it('returns the base message when cause is present but unhelpful', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: {} });
    expect(formatProxyErrorMessage(err)).toBe('fetch failed');
  });
});
