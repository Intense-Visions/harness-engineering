import { describe, it, expect, vi } from 'vitest';
import { fetchWithConflict } from '../../../src/client/utils/fetchWithConflict';

describe('fetchWithConflict', () => {
  it('returns {ok:true, data} on 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ greeting: 'hi' }) }))
    );
    const r = await fetchWithConflict('/x', { method: 'POST' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ greeting: 'hi' });
    vi.unstubAllGlobals();
  });

  it('returns {ok:false, conflict} on 409 with TRACKER_CONFLICT body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'conflict',
          code: 'TRACKER_CONFLICT',
          externalId: 'github:o/r#1',
          conflictedWith: '@alice',
          refreshHint: 'reload-roadmap',
        }),
      }))
    );
    const r = await fetchWithConflict('/x', { method: 'POST' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.conflict?.externalId).toBe('github:o/r#1');
      expect(r.conflict?.conflictedWith).toBe('@alice');
    }
    vi.unstubAllGlobals();
  });

  it('returns {ok:false, error} on 409 with NON-TRACKER_CONFLICT body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: 'some other 409' }),
      }))
    );
    const r = await fetchWithConflict('/x', { method: 'POST' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.conflict).toBeUndefined();
      expect(r.error).toBe('some other 409');
    }
    vi.unstubAllGlobals();
  });

  it('returns {ok:false, error} on non-409 errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => ({ error: 'upstream' }),
      }))
    );
    const r = await fetchWithConflict('/x', { method: 'POST' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(502);
      expect(r.error).toBe('upstream');
    }
    vi.unstubAllGlobals();
  });

  it('returns {ok:false, error:"Network error"} on fetch rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      })
    );
    const r = await fetchWithConflict('/x', { method: 'POST' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Network error|boom/);
    vi.unstubAllGlobals();
  });
});
