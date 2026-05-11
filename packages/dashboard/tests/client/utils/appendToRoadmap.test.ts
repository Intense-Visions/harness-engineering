/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appendToRoadmap } from '../../../src/client/utils/appendToRoadmap';
import { useToastStore } from '../../../src/client/stores/toastStore';

beforeEach(() => {
  useToastStore.getState().clear();
});

describe('appendToRoadmap', () => {
  it('returns ok:true on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ ok: true, featureName: 'X', externalId: 'github:o/r#1' }),
      }))
    );
    const r = await appendToRoadmap({ title: 'X' });
    expect(r.ok).toBe(true);
    expect(r.featureName).toBe('X');
    vi.unstubAllGlobals();
  });

  it('pushes toast and returns ok:false on TRACKER_CONFLICT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'conflict',
          code: 'TRACKER_CONFLICT',
          externalId: 'github:o/r#42',
          conflictedWith: '@alice',
          refreshHint: 'reload-roadmap',
        }),
      }))
    );
    const r = await appendToRoadmap({ title: 'X' });
    expect(r.ok).toBe(false);
    expect(useToastStore.getState().current?.externalId).toBe('github:o/r#42');
    expect(useToastStore.getState().current?.conflictedWith).toBe('@alice');
    vi.unstubAllGlobals();
  });

  it('returns ok:false with error on generic failure (no toast)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }))
    );
    const r = await appendToRoadmap({ title: 'X' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
    expect(useToastStore.getState().current).toBeNull();
    vi.unstubAllGlobals();
  });
});
