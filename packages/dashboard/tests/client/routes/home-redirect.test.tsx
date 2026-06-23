import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router';
import { SystemRoute } from '../../../src/client/components/layout/ThreadView';
import type { SignalResult } from '../../../src/client/types/signals';

// Mirror of main.tsx's route tree for the paths under test. Asserting the
// '/' -> '/s/signals' redirect + page render here covers the Task 8
// human-verify checkpoint with automation (manual browser check recommended
// at PR time).
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/s/signals" replace />} />
      <Route path="/s/:systemPage" element={<SystemRoute />} />
    </Routes>
  );
}

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

describe("'/' redirect (Truth 6)", () => {
  it("redirects '/' to '/s/signals' and renders the five signal cards", async () => {
    mockSignals([
      mk({ id: 'a', label: 'A' }),
      mk({ id: 'b', label: 'B' }),
      mk({ id: 'c', label: 'C' }),
      mk({ id: 'd', label: 'D' }),
      mk({ id: 'e', label: 'E' }),
    ]);

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Redirect lands on the Signals page, which fetches /api/signals and
    // renders one card per returned signal.
    await waitFor(() => expect(screen.getByTestId('signal-card-a')).toBeDefined());
    ['b', 'c', 'd', 'e'].forEach((id) =>
      expect(screen.getByTestId(`signal-card-${id}`)).toBeDefined()
    );
  });
});
