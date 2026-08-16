/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { RoadmapData, DashboardFeature } from '../../../src/shared/types';

/**
 * Page-level acceptance coverage for the author-intent panel on the Roadmap
 * page. Phase 2/3 of the spec → AC1 (fields render, no chat thread on mount),
 * AC3 (success re-fetch surfaces the new row in FeatureTable), AC6 (lane
 * gating: pm-ba/dev render, client hidden).
 *
 * `useSSE` is mocked (no EventSource in jsdom) and `fetch` is stubbed.
 */

function feature(name: string): DashboardFeature {
  return {
    name,
    status: 'planned',
    summary: '',
    milestone: 'Backlog',
    blockedBy: [],
    assignee: null,
    priority: null,
    spec: null,
    plans: [],
    externalId: null,
    updatedAt: null,
  };
}

function makeRoadmap(names: string[]): RoadmapData {
  return {
    milestones: [
      {
        name: 'Backlog',
        isBacklog: true,
        total: names.length,
        done: 0,
        inProgress: 0,
        planned: names.length,
        blocked: 0,
        backlog: names.length,
        needsHuman: 0,
      },
    ],
    features: names.map(feature),
    assignmentHistory: [],
    totalFeatures: names.length,
    totalDone: 0,
    totalInProgress: 0,
    totalPlanned: names.length,
    totalBlocked: 0,
    totalBacklog: names.length,
    totalNeedsHuman: 0,
  };
}

// Mock SSE to seed the page with one existing backlog item.
vi.mock('../../../src/client/hooks/useSSE', () => ({
  useSSE: () => ({
    data: { roadmap: makeRoadmap(['Existing item']) },
    lastUpdated: '2026-08-15T00:00:00Z',
    stale: false,
    error: null,
  }),
}));

// Import AFTER the mock is registered.
const { Roadmap } = await import('../../../src/client/pages/Roadmap');
const { RoleProvider } = await import('../../../src/client/hooks/useRole');
const { useToastStore } = await import('../../../src/client/stores/toastStore');
const { useThreadStore } = await import('../../../src/client/stores/threadStore');

const STORAGE_KEY = 'harness.dashboard.role';

function stubFetch(roadmapAfterAppend: RoadmapData) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      // Order matters: /api/roadmap/append is a prefix-match of /api/roadmap.
      if (input.startsWith('/api/roadmap/append')) {
        expect(init?.method).toBe('POST');
        return {
          ok: true,
          status: 201,
          json: async () => ({ ok: true, featureName: 'New digest', externalId: 'github:o/r#711' }),
        };
      }
      if (input.startsWith('/api/roadmap')) {
        return { ok: true, status: 200, json: async () => roadmapAfterAppend };
      }
      if (input.startsWith('/api/identity')) {
        return { ok: true, json: async () => ({ username: 'chadjw', source: 'gh-cli' }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'unknown' }) };
    })
  );
}

function renderRoadmap() {
  return render(
    <MemoryRouter>
      <RoleProvider>
        <Roadmap />
      </RoleProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  useToastStore.getState().clear();
  useToastStore.getState().clearSuccess();
  Element.prototype.scrollIntoView = vi.fn();
  stubFetch(makeRoadmap(['Existing item', 'New digest']));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Roadmap author-intent panel', () => {
  it('AC1: renders the form fields in the pm-ba lane without creating a chat thread on mount', async () => {
    localStorage.setItem(STORAGE_KEY, 'pm-ba');
    const createSpy = vi.spyOn(useThreadStore.getState(), 'createThread');
    renderRoadmap();

    expect(screen.getByLabelText(/what do you want built/i)).toBeDefined();
    expect(screen.getByLabelText(/any detail/i)).toBeDefined();
    // No slash command / chat thread is spun up just by landing on the page.
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('AC3: a successful submit clears the field, toasts, and surfaces the new row', async () => {
    localStorage.setItem(STORAGE_KEY, 'pm-ba');
    renderRoadmap();

    const title = screen.getByLabelText(/what do you want built/i) as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'New digest' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to roadmap/i }));
    });

    await waitFor(() => expect(title.value).toBe(''));
    expect(useToastStore.getState().success?.message).toContain('New digest');
    // The page re-fetched /api/roadmap and the new backlog row is now rendered.
    await waitFor(() => expect(screen.getByText('New digest')).toBeDefined());
  });

  it('AC6: the panel renders for dev and pm-ba but is hidden for client', () => {
    // dev
    localStorage.setItem(STORAGE_KEY, 'dev');
    const dev = renderRoadmap();
    expect(dev.queryByText(/author intent/i)).not.toBeNull();
    dev.unmount();

    // pm-ba
    localStorage.setItem(STORAGE_KEY, 'pm-ba');
    const pmba = renderRoadmap();
    expect(pmba.queryByText(/author intent/i)).not.toBeNull();
    pmba.unmount();

    // client — hidden
    localStorage.setItem(STORAGE_KEY, 'client');
    const client = renderRoadmap();
    expect(client.queryByText(/author intent/i)).toBeNull();
    expect(client.queryByLabelText(/what do you want built/i)).toBeNull();
    client.unmount();
  });
});
