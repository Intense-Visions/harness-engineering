import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClaimConfirmation } from '../../../../src/client/components/roadmap/ClaimConfirmation';
import type { DashboardFeature, ClaimResponse } from '../../../../src/shared/types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeFeature(overrides?: Partial<DashboardFeature>): DashboardFeature {
  return {
    name: 'Auth System',
    status: 'planned',
    summary: 'Implement authentication',
    milestone: 'M1',
    blockedBy: [],
    assignee: null,
    priority: 'P1',
    spec: null,
    plans: [],
    externalId: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeClaimResponse(overrides?: Partial<ClaimResponse>): ClaimResponse {
  return {
    ok: true,
    feature: 'Auth System',
    status: 'in-progress',
    assignee: 'chadjw',
    workflow: 'brainstorming',
    githubSynced: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('ClaimConfirmation', () => {
  it('displays feature name', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ name: 'My Feature' })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('My Feature')).toBeDefined();
  });

  it('displays identity username', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('chadjw')).toBeDefined();
  });

  it('detects brainstorming workflow when no spec', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: null, plans: [] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Brainstorming')).toBeDefined();
    expect(screen.getByText(/No spec found/)).toBeDefined();
  });

  it('detects brainstorming workflow when spec is em-dash', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: '\u2014', plans: [] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Brainstorming')).toBeDefined();
  });

  it('detects planning workflow when spec exists but no plans', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: 'docs/specs/auth.md', plans: [] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Planning')).toBeDefined();
    expect(screen.getByText(/Spec exists but no plan/)).toBeDefined();
  });

  it('detects planning workflow when plans is em-dash', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: 'docs/specs/auth.md', plans: ['\u2014'] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Planning')).toBeDefined();
  });

  it('detects execution workflow when spec and plans exist', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: 'docs/specs/auth.md', plans: ['docs/plans/auth-plan.md'] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Execution')).toBeDefined();
    expect(screen.getByText(/Spec and plan exist/)).toBeDefined();
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('POSTs to claim endpoint on confirm and calls onConfirm with response', async () => {
    const response = makeClaimResponse({ workflow: 'brainstorming' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => response,
    });
    const onConfirm = vi.fn();

    render(
      <ClaimConfirmation
        feature={makeFeature({ name: 'Auth System' })}
        identity="chadjw"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/actions/roadmap/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: 'Auth System', assignee: 'chadjw' }),
      });
      expect(onConfirm).toHaveBeenCalledWith(response);
    });
  });

  it('shows error message on failed claim', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Feature already claimed' }),
    });

    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(screen.getByText('Feature already claimed')).toBeDefined();
    });
  });

  it('shows network error on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('shows loading state while claiming', async () => {
    // Create a deferred promise to control resolution timing
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      // "Claiming..." button text (use exact match to avoid matching "Claiming as" paragraph)
      expect(screen.getByText('Claiming\u2026')).toBeDefined();
    });

    // Resolve to clean up
    resolveFetch({
      ok: true,
      json: async () => makeClaimResponse(),
    });
  });
});
