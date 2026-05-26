import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { RoutingDecision } from '@harness-engineering/types';
import { RoutingDecisionsCard } from '../../../../src/client/components/cards/RoutingDecisionsCard';

function mk(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    timestamp: new Date().toISOString(),
    useCase: { kind: 'skill', skillName: 'foo' },
    resolutionPath: [{ source: 'skill', candidate: 'a', outcome: 'chosen' }],
    backendName: 'a',
    backendType: 'anthropic',
    durationMs: 1,
    ...overrides,
  };
}

describe('RoutingDecisionsCard', () => {
  it('renders routing-card-decisions and routing-ws-status reflecting the status prop', () => {
    render(<RoutingDecisionsCard decisions={[]} status="live" error={null} />);
    expect(screen.getByTestId('routing-card-decisions')).toBeDefined();
    expect(screen.getByTestId('routing-ws-status').textContent).toBe('live');
  });

  it('renders a row per decision and filters by skill name', () => {
    render(
      <RoutingDecisionsCard
        decisions={[
          mk({ useCase: { kind: 'skill', skillName: 'foo' }, backendName: 'a' }),
          mk({ useCase: { kind: 'skill', skillName: 'bar' }, backendName: 'b' }),
          mk({ useCase: { kind: 'mode', cognitiveMode: 'reviewer' }, backendName: 'c' }),
        ]}
        status="live"
        error={null}
      />
    );
    expect(screen.getAllByTestId(/^decision-row-\d+$/).length).toBe(3);
    fireEvent.change(screen.getByTestId('decision-filter-skill'), { target: { value: 'foo' } });
    expect(screen.getAllByTestId(/^decision-row-\d+$/).length).toBe(1);
  });

  it('toggles row expansion on click, rendering every resolutionPath step', () => {
    render(
      <RoutingDecisionsCard
        decisions={[
          mk({
            resolutionPath: [
              { source: 'skill', candidate: 'a', outcome: 'unknown-backend' },
              { source: 'default', candidate: 'b', outcome: 'chosen' },
            ],
          }),
        ]}
        status="live"
        error={null}
      />
    );
    fireEvent.click(screen.getByTestId('decision-row-0'));
    const expanded = screen.getByTestId('decision-row-0-expanded');
    const text = expanded.textContent ?? '';
    expect(text).toContain('a');
    expect(text).toContain('b');
    expect(text).toContain('unknown-backend');
    expect(text).toContain('chosen');
  });

  it('renders decisions-empty empty-state when decisions is empty (Truth 6)', () => {
    render(<RoutingDecisionsCard decisions={[]} status="live" error={null} />);
    const empty = screen.getByTestId('decisions-empty');
    expect(empty.textContent).toBe('No routing decisions recorded yet.');
  });
});
