/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { RoadmapData } from '../../../src/shared/types';

function makeRoadmap(features: { name: string; externalId: string }[]): RoadmapData {
  return {
    milestones: [
      {
        name: 'M1',
        isBacklog: false,
        total: features.length,
        done: 0,
        inProgress: 0,
        planned: features.length,
        blocked: 0,
        backlog: 0,
        needsHuman: 0,
      },
    ],
    features: features.map((f) => ({
      name: f.name,
      status: 'planned',
      summary: '',
      milestone: 'M1',
      blockedBy: [],
      assignee: null,
      priority: null,
      spec: null,
      plans: [],
      externalId: f.externalId,
      updatedAt: null,
    })),
    assignmentHistory: [],
    totalFeatures: features.length,
    totalDone: 0,
    totalInProgress: 0,
    totalPlanned: features.length,
    totalBlocked: 0,
    totalBacklog: 0,
    totalNeedsHuman: 0,
  };
}

// Mock useSSE to return a fixed roadmap state.
vi.mock('../../../src/client/hooks/useSSE', () => ({
  useSSE: () => ({
    data: {
      roadmap: makeRoadmap([
        { name: 'Auth', externalId: 'github:o/r#42' },
        { name: 'Search', externalId: 'github:o/r#43' },
      ]),
    },
    lastUpdated: '2026-05-09T00:00:00Z',
    stale: false,
    error: null,
  }),
}));

// Import AFTER the mock is registered.
const { Roadmap } = await import('../../../src/client/pages/Roadmap');
const { useToastStore } = await import('../../../src/client/stores/toastStore');

beforeEach(() => {
  useToastStore.getState().clear();
  // jsdom doesn't implement scrollIntoView; stub on the prototype.
  Element.prototype.scrollIntoView = vi.fn();
  // Stub identity fetch (used on mount) and /api/roadmap refetch.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      if (input.startsWith('/api/identity')) {
        return { ok: true, json: async () => ({ username: 'chadjw', source: 'gh-cli' }) };
      }
      if (input.startsWith('/api/roadmap')) {
        return {
          ok: true,
          status: 200,
          json: async () => makeRoadmap([{ name: 'Auth', externalId: 'github:o/r#42' }]),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'unknown' }) };
    })
  );
});

describe('Roadmap conflict UX', () => {
  it('on toast pushed: refetches /api/roadmap and scrolls to the row', async () => {
    render(
      <MemoryRouter>
        <Roadmap />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(document.querySelector('[data-external-id="github:o/r#42"]')).not.toBeNull();
    });
    act(() => {
      useToastStore.getState().pushConflict({
        externalId: 'github:o/r#42',
        conflictedWith: '@alice',
      });
    });
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c) => String(c[0]).startsWith('/api/roadmap'))).toBe(true);
    });
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    });
  });

  it('degraded fallback: row absent after refetch → no scroll error', async () => {
    // /api/roadmap returns an empty feature list (row vanished).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.startsWith('/api/identity'))
          return { ok: true, json: async () => ({ username: 'chadjw', source: 'gh-cli' }) };
        if (input.startsWith('/api/roadmap'))
          return { ok: true, status: 200, json: async () => makeRoadmap([]) };
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );
    render(
      <MemoryRouter>
        <Roadmap />
      </MemoryRouter>
    );
    act(() => {
      useToastStore.getState().pushConflict({
        externalId: 'github:o/r#999',
        conflictedWith: '@alice',
      });
    });
    // Should not throw; toast remains.
    await waitFor(() => {
      expect(useToastStore.getState().current?.externalId).toBe('github:o/r#999');
    });
  });
});
