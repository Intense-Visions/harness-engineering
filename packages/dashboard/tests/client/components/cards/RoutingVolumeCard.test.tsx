import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RoutingDecision } from '@harness-engineering/types';
import { RoutingVolumeCard } from '../../../../src/client/components/cards/RoutingVolumeCard';

const now = Date.now();
function mk(backendName: string, ageMs: number): RoutingDecision {
  return {
    timestamp: new Date(now - ageMs).toISOString(),
    useCase: { kind: 'skill', skillName: 'x' },
    resolutionPath: [{ source: 'skill', candidate: backendName, outcome: 'chosen' }],
    backendName,
    backendType: 'anthropic',
    durationMs: 1,
  };
}

describe('RoutingVolumeCard', () => {
  it('renders routing-card-volume testid', () => {
    render(<RoutingVolumeCard decisions={[]} backends={[]} />);
    expect(screen.getByTestId('routing-card-volume')).toBeDefined();
  });

  it('aggregates 24h counts by backend (Truth 8, O4)', () => {
    const decisions: RoutingDecision[] = [];
    for (let i = 0; i < 60; i++) decisions.push(mk('a', i * 1_000));
    for (let i = 0; i < 40; i++) decisions.push(mk('b', i * 1_000));
    render(<RoutingVolumeCard decisions={decisions} backends={['a', 'b']} />);
    expect(screen.getByTestId('volume-count-a').textContent).toBe('60');
    expect(screen.getByTestId('volume-count-b').textContent).toBe('40');
  });

  it('renders 0 count + em-dash success rate for zero-dispatch backend (Truth 7)', () => {
    render(<RoutingVolumeCard decisions={[mk('a', 1_000)]} backends={['a', 'b', 'c']} />);
    expect(screen.getByTestId('volume-count-b').textContent).toBe('0');
    expect(screen.getByTestId('volume-rate-b').textContent).toBe('—');
    expect(screen.getByTestId('volume-count-c').textContent).toBe('0');
    expect(screen.getByTestId('volume-rate-c').textContent).toBe('—');
  });

  it('excludes decisions older than 24h from the count window (Truth 8 strict-bound)', () => {
    const inside = mk('a', 1_000); // ~1 second ago
    const outside = mk('a', 25 * 60 * 60 * 1000); // 25 hours ago
    render(<RoutingVolumeCard decisions={[inside, outside]} backends={['a']} />);
    expect(screen.getByTestId('volume-count-a').textContent).toBe('1');
  });

  it('renders 100% success rate for any backend with >=1 decision (resolver only emits on success)', () => {
    render(<RoutingVolumeCard decisions={[mk('a', 1_000)]} backends={['a']} />);
    expect(screen.getByTestId('volume-rate-a').textContent).toBe('100%');
  });
});
