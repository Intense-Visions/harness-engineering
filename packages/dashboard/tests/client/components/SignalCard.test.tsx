import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignalCard } from '../../../src/client/components/SignalCard';
import type { SignalResult } from '../../../src/client/types/signals';

const base: SignalResult = {
  id: 'complexity-trend-up-30d',
  label: 'Complexity Trend',
  value: 12,
  unit: '%',
  trend: 'up',
  betterDirection: 'down',
  status: 'warn',
  threshold: { warn: 5, alert: 15 },
  history: [
    { date: '2026-06-01', value: 8 },
    { date: '2026-06-02', value: 12 },
  ],
  detail: 'Up 4% over 30d',
  source: 'arch/timeline.json',
};

describe('SignalCard', () => {
  it('renders label, value+unit, trend arrow, and a sparkline for an ok/warn/alert signal (Truth 2)', () => {
    const { container } = render(<SignalCard signal={base} />);
    expect(screen.getByText('Complexity Trend')).toBeDefined();
    expect(screen.getByTestId('signal-value').textContent).toContain('12');
    expect(screen.getByTestId('signal-value').textContent).toContain('%');
    expect(screen.getByTestId('signal-trend').textContent).toContain('↑'); // up arrow
    expect(container.querySelector('polyline')).not.toBeNull();
  });

  it('renders a muted detail-only card with no value for pending (Truth 3)', () => {
    render(
      <SignalCard
        signal={{ ...base, status: 'pending', value: null, detail: 'Awaiting outcome-eval' }}
      />
    );
    expect(screen.getByText('Awaiting outcome-eval')).toBeDefined();
    expect(screen.queryByTestId('signal-value')).toBeNull();
  });

  it('renders a muted detail-only card with no value for error (Truth 3)', () => {
    render(
      <SignalCard
        signal={{ ...base, status: 'error', value: null, detail: 'No coverage source' }}
      />
    );
    expect(screen.getByText('No coverage source')).toBeDefined();
    expect(screen.queryByTestId('signal-value')).toBeNull();
  });

  it('rounds a fractional value to 1 decimal place', () => {
    render(
      <SignalCard
        signal={{
          ...base,
          id: 'eval-fail-rate',
          label: 'Eval Fail Rate',
          unit: '%',
          value: 7.3456,
          status: 'warn',
        }}
      />
    );
    const text = screen.getByTestId('signal-value').textContent ?? '';
    expect(text).toContain('7.3');
    expect(text).not.toContain('7.3456');
  });

  it('renders an em dash when value is null on a non-muted status', () => {
    render(<SignalCard signal={{ ...base, value: null, status: 'warn' }} />);
    expect(screen.getByTestId('signal-value').textContent).toContain('—');
  });
});
