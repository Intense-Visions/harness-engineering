import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { StatusSection } from '../../../../src/client/components/panel/StatusSection';

// A fixed epoch to anchor the fake clock so elapsed-time math is deterministic.
const STARTED_AT = 1_700_000_000_000;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StatusSection', () => {
  it('renders nothing when both phase and skill are absent', () => {
    const { container } = render(<StatusSection phase={null} skill={null} startedAt={null} />);
    // Guard clause returns null even when a startedAt exists.
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when phase and skill are absent even with a running timer', () => {
    const { container } = render(
      <StatusSection phase={null} skill={null} startedAt={STARTED_AT} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the phase text when a phase is provided', () => {
    render(<StatusSection phase="planning" skill={null} startedAt={null} />);
    expect(screen.getByText('planning')).toBeDefined();
    // No timer without a startedAt.
    expect(screen.queryByText(/^0s$/)).toBeNull();
  });

  it('renders the skill name alongside its label', () => {
    render(<StatusSection phase={null} skill="canary-test-author" startedAt={null} />);
    expect(screen.getByText('Skill:')).toBeDefined();
    expect(screen.getByText('canary-test-author')).toBeDefined();
  });

  it('renders both phase and skill when both are provided', () => {
    render(<StatusSection phase="review" skill="canary-test-reviewer" startedAt={null} />);
    expect(screen.getByText('review')).toBeDefined();
    expect(screen.getByText('canary-test-reviewer')).toBeDefined();
  });

  it('shows an initial elapsed of 0s when a startedAt is provided', () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_AT);
    render(<StatusSection phase="planning" skill={null} startedAt={STARTED_AT} />);
    // Initial elapsed state is 0 before any interval tick fires.
    expect(screen.getByText('0s')).toBeDefined();
  });

  it('formats sub-minute elapsed time as seconds after the interval ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_AT);
    render(<StatusSection phase="planning" skill={null} startedAt={STARTED_AT} />);

    // Advance the fake clock 30s: Date.now() - startedAt = 30_000ms -> "30s".
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('30s')).toBeDefined();
  });

  it('formats elapsed time past a minute as "Xm Ys" after the interval ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_AT);
    render(<StatusSection phase="planning" skill={null} startedAt={STARTED_AT} />);

    // Advance 65s: floor(65) -> 1 minute, 5 remaining seconds -> "1m 5s".
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByText('1m 5s')).toBeDefined();
  });

  it('stops updating the timer after unmount (interval cleanup)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_AT);
    const { unmount } = render(
      <StatusSection phase="planning" skill={null} startedAt={STARTED_AT} />
    );
    unmount();
    // Advancing the clock after unmount must not throw from a dangling interval.
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
    }).not.toThrow();
  });
});
