import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from '../../../src/client/components/Sparkline';

describe('Sparkline', () => {
  it('renders a polyline with one point per history value (Truth 2)', () => {
    const { container } = render(
      <Sparkline
        points={[
          { date: '2026-06-01', value: 1 },
          { date: '2026-06-02', value: 3 },
          { date: '2026-06-03', value: 2 },
        ]}
      />
    );
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    expect(poly!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(3);
    expect(poly!.getAttribute('stroke')).toBe('currentColor');
  });

  it('renders nothing meaningful for an empty history', () => {
    const { container } = render(<Sparkline points={[]} />);
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('renders nothing meaningful for a single point', () => {
    const { container } = render(<Sparkline points={[{ date: '2026-06-01', value: 1 }]} />);
    expect(container.querySelector('polyline')).toBeNull();
  });
});
