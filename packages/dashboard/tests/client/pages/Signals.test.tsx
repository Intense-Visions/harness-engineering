import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Signals } from '../../../src/client/pages/Signals';
import type { SignalResult } from '../../../src/client/types/signals';

const mk = (over: Partial<SignalResult>): SignalResult => ({
  id: 'complexity-trend-up-30d',
  label: 'Complexity',
  value: 1,
  unit: '%',
  trend: 'flat',
  betterDirection: 'down',
  status: 'ok',
  threshold: { warn: 5, alert: 15 },
  history: [
    { date: '2026-06-01', value: 1 },
    { date: '2026-06-02', value: 1 },
  ],
  detail: 'ok',
  source: 's',
  ...over,
});

function mockSignals(signals: SignalResult[]) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        data: { signals, generatedAt: '2026-06-22T00:00:00Z' },
        timestamp: '2026-06-22T00:00:00Z',
      }),
      { status: 200 }
    )
  );
}
afterEach(() => vi.restoreAllMocks());

describe('Signals page', () => {
  it('renders one card per signal returned (Truth 1)', async () => {
    mockSignals([
      mk({ id: 'a', label: 'A' }),
      mk({ id: 'b', label: 'B' }),
      mk({ id: 'c', label: 'C' }),
      mk({ id: 'd', label: 'D' }),
      mk({ id: 'e', label: 'E' }),
    ]);
    render(<Signals />);
    await waitFor(() => expect(screen.getByTestId('signal-card-a')).toBeDefined());
    ['b', 'c', 'd', 'e'].forEach((id) =>
      expect(screen.getByTestId(`signal-card-${id}`)).toBeDefined()
    );
  });

  it('renders a single error message when the fetch fails (Truth 5)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    render(<Signals />);
    await waitFor(() => expect(screen.getByTestId('signals-error')).toBeDefined());
  });
});
