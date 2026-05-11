/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ConflictToastRegion } from '../../../src/client/components/ConflictToastRegion';
import { useToastStore } from '../../../src/client/stores/toastStore';

beforeEach(() => {
  useToastStore.getState().clear();
  document.body.innerHTML = '';
});

describe('ConflictToastRegion', () => {
  it('renders nothing when there is no current toast', () => {
    const { container } = render(<ConflictToastRegion onRefresh={vi.fn()} />);
    // The aria-live container is always present; assert no toast text.
    expect(container.querySelector('[data-testid="conflict-toast-body"]')).toBeNull();
  });

  it('declares role="status" and aria-live="polite" on the region', () => {
    render(<ConflictToastRegion onRefresh={vi.fn()} />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });

  it('renders "Claimed by @alice — refresh" when a conflict is pushed', async () => {
    const onRefresh = vi.fn(async () => undefined);
    render(<ConflictToastRegion onRefresh={onRefresh} />);
    act(() => {
      useToastStore.getState().pushConflict({
        externalId: 'github:o/r#1',
        conflictedWith: '@alice',
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Claimed by @alice — refresh/)).toBeDefined();
    });
  });

  it('renders fallback "another session" when conflictedWith is null', async () => {
    render(<ConflictToastRegion onRefresh={vi.fn()} />);
    act(() => {
      useToastStore.getState().pushConflict({
        externalId: 'github:o/r#1',
        conflictedWith: null,
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Claimed by another session — refresh/)).toBeDefined();
    });
  });

  it('invokes onRefresh with externalId when toast appears', async () => {
    const onRefresh = vi.fn(async () => undefined);
    render(<ConflictToastRegion onRefresh={onRefresh} />);
    act(() => {
      useToastStore.getState().pushConflict({
        externalId: 'github:o/r#42',
        conflictedWith: '@alice',
      });
    });
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledWith('github:o/r#42');
    });
  });

  it('dismiss button clears the store', async () => {
    render(<ConflictToastRegion onRefresh={vi.fn()} />);
    act(() => {
      useToastStore.getState().pushConflict({
        externalId: 'x',
        conflictedWith: '@a',
      });
    });
    await waitFor(() => screen.getByRole('button', { name: /dismiss/i }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(useToastStore.getState().current).toBeNull();
  });
});
