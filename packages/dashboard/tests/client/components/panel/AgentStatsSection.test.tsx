import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import {
  AgentStatsSection,
  type AgentStats,
} from '../../../../src/client/components/panel/AgentStatsSection';

/**
 * A completed (non-running) agent with no tokens and no PR. This is the
 * minimal "quiet" state: Agent Details always render; Session Stats and the
 * running/duration lines are conditional.
 */
function makeStats(overrides: Partial<AgentStats> = {}): AgentStats {
  return {
    identifier: 'feat/backfill-tests',
    phase: 'StreamingTurn',
    backendName: null,
    description: null,
    turnCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    startedAt: null,
    durationMs: null,
    isRunning: false,
    pr: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AgentStatsSection', () => {
  it('always renders the identifier and phase in Agent Details', () => {
    render(<AgentStatsSection stats={makeStats({ identifier: 'fix/foo', phase: 'Planning' })} />);
    expect(screen.getByText('Identifier')).toBeDefined();
    expect(screen.getByText('fix/foo')).toBeDefined();
    expect(screen.getByText('Phase')).toBeDefined();
    expect(screen.getByText('Planning')).toBeDefined();
  });

  it('omits the Backend row when backendName is null and shows it when present', () => {
    const { rerender } = render(<AgentStatsSection stats={makeStats({ backendName: null })} />);
    expect(screen.queryByText('Backend')).toBeNull();

    rerender(<AgentStatsSection stats={makeStats({ backendName: 'qwen3-coder:30b' })} />);
    expect(screen.getByText('Backend')).toBeDefined();
    expect(screen.getByText('qwen3-coder:30b')).toBeDefined();
  });

  it('omits the PR row when pr is null and renders number + status when present', () => {
    const { rerender } = render(<AgentStatsSection stats={makeStats({ pr: null })} />);
    expect(screen.queryByText('PR')).toBeNull();

    rerender(<AgentStatsSection stats={makeStats({ pr: { number: 945, status: 'open' } })} />);
    expect(screen.getByText('PR')).toBeDefined();
    expect(screen.getByText(/#945/)).toBeDefined();
    expect(screen.getByText('open')).toBeDefined();
  });

  it('hides the Session Stats block entirely when totalTokens is 0', () => {
    render(<AgentStatsSection stats={makeStats({ totalTokens: 0, turnCount: 3 })} />);
    expect(screen.queryByText('Session Stats')).toBeNull();
    expect(screen.queryByText('Turns')).toBeNull();
  });

  it('renders Session Stats with turn count and formatted token figures when tokens exist', () => {
    render(
      <AgentStatsSection
        stats={makeStats({
          turnCount: 7,
          totalTokens: 2_500_000, // -> 2.5M
          inputTokens: 1_500, // -> 1.5k
          outputTokens: 500, // -> 500 (no suffix)
        })}
      />
    );
    expect(screen.getByText('Session Stats')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined(); // turn count
    expect(screen.getByText('2.5M')).toBeDefined(); // total tokens (>= 1M)
    expect(screen.getByText('1.5k')).toBeDefined(); // input tokens (>= 1k)
    expect(screen.getByText('500')).toBeDefined(); // output tokens (< 1k, raw)
  });

  it('formats a completed run as "Duration: ..." using hours/minutes/seconds rollover', () => {
    // 1h 2m 5s -> hours branch prints "1h 2m" (seconds dropped once past an hour)
    render(
      <AgentStatsSection
        stats={makeStats({ isRunning: false, durationMs: 3_725_000, startedAt: 1_000 })}
      />
    );
    expect(screen.getByText('Duration: 1h 2m')).toBeDefined();
  });

  it('formats a sub-hour completed run as "Xm Ys"', () => {
    // 125_000ms -> 2m 5s
    render(<AgentStatsSection stats={makeStats({ isRunning: false, durationMs: 125_000 })} />);
    expect(screen.getByText('Duration: 2m 5s')).toBeDefined();
  });

  it('renders a startedAt-only elapsed line when not running and no durationMs', () => {
    vi.useFakeTimers();
    const startedAt = 10_000;
    vi.setSystemTime(startedAt + 45_000); // 45s elapsed -> "45s"
    render(
      <AgentStatsSection stats={makeStats({ isRunning: false, durationMs: null, startedAt })} />
    );
    expect(screen.getByText('45s')).toBeDefined();
    expect(screen.queryByText(/Duration:/)).toBeNull();
    expect(screen.queryByText(/Running for/)).toBeNull();
  });

  it('renders nothing in the duration line when not running with no timing info', () => {
    render(
      <AgentStatsSection
        stats={makeStats({ isRunning: false, durationMs: null, startedAt: null })}
      />
    );
    expect(screen.queryByText(/Duration:/)).toBeNull();
    expect(screen.queryByText(/Running for/)).toBeNull();
  });

  it('shows a live "Running for" line that ticks up on each interval while running', () => {
    vi.useFakeTimers();
    const startedAt = 100_000;
    vi.setSystemTime(startedAt); // 0s elapsed at mount
    render(<AgentStatsSection stats={makeStats({ isRunning: true, startedAt })} />);

    // Effect runs on mount: elapsed = now - startedAt = 0 -> "0s"
    expect(screen.getByText('Running for 0s')).toBeDefined();

    // Advancing fake timers also advances the mocked clock, so Date.now() moves
    // forward and the 1s interval recomputes elapsed from it.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText('Running for 3s')).toBeDefined();
  });

  it('clears the interval on unmount so no timer fires after teardown', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const startedAt = 200_000;
    vi.setSystemTime(startedAt);
    const { unmount } = render(
      <AgentStatsSection stats={makeStats({ isRunning: true, startedAt })} />
    );
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
