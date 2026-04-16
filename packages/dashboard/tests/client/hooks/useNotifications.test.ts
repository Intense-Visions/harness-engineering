import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNotifications } from '../../../src/client/hooks/useNotifications';
import type { PendingInteraction } from '../../../src/client/types/orchestrator';

let mockPermission = 'default';
const mockRequestPermission = vi.fn().mockResolvedValue('granted');
const MockNotification = vi.fn();

beforeEach(() => {
  mockPermission = 'default';
  MockNotification.mockClear();
  mockRequestPermission.mockClear().mockResolvedValue('granted');

  Object.defineProperty(MockNotification, 'permission', {
    get: () => mockPermission,
    configurable: true,
  });
  MockNotification.requestPermission = mockRequestPermission;

  vi.stubGlobal('Notification', MockNotification);

  Object.defineProperty(document, 'hidden', {
    value: true,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeInteraction(id: string): PendingInteraction {
  return {
    id,
    issueId: `issue-${id}`,
    type: 'needs-human',
    reasons: ['test reason'],
    context: {
      issueTitle: `Test Issue ${id}`,
      issueDescription: null,
      specPath: null,
      planPath: null,
      relatedFiles: [],
    },
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

describe('useNotifications', () => {
  it('requests permission on mount', () => {
    renderHook(() => useNotifications([]));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('fires notification for new interaction when document is hidden', () => {
    mockPermission = 'granted';
    const interactions = [makeInteraction('1')];
    const { rerender } = renderHook(({ interactions }) => useNotifications(interactions), {
      initialProps: { interactions: [] as PendingInteraction[] },
    });

    rerender({ interactions });

    expect(MockNotification).toHaveBeenCalledWith(
      expect.stringContaining('Needs Attention'),
      expect.objectContaining({ body: expect.stringContaining('Test Issue 1') })
    );
  });

  it('does not fire notification when document is visible', () => {
    mockPermission = 'granted';
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    const { rerender } = renderHook(({ interactions }) => useNotifications(interactions), {
      initialProps: { interactions: [] as PendingInteraction[] },
    });

    rerender({ interactions: [makeInteraction('1')] });

    expect(MockNotification).not.toHaveBeenCalled();
  });

  it('does not fire for already-seen interactions', () => {
    mockPermission = 'granted';
    const interaction = makeInteraction('1');

    const { rerender } = renderHook(({ interactions }) => useNotifications(interactions), {
      initialProps: { interactions: [interaction] },
    });

    // Rerender with same interaction -- should not re-notify
    MockNotification.mockClear();
    rerender({ interactions: [interaction] });

    expect(MockNotification).not.toHaveBeenCalled();
  });
});
