import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { RoutingDecision } from '@harness-engineering/types';
import { RoutingChainsCard } from '../../../../src/client/components/cards/RoutingChainsCard';

describe('RoutingChainsCard', () => {
  it('renders routing-card-chains testid', () => {
    render(<RoutingChainsCard resolvedChains={{}} decisions={[]} />);
    expect(screen.getByTestId('routing-card-chains')).toBeDefined();
  });

  it('renders one row per resolvedChains key', () => {
    render(
      <RoutingChainsCard
        resolvedChains={{
          'skill:harness-debugging': [{ candidate: 'a', exists: true }],
          'mode:reviewer': [{ candidate: 'b', exists: true }],
          default: [{ candidate: 'c', exists: true }],
        }}
        decisions={[]}
      />
    );
    expect(screen.getByTestId('chain-row-skill:harness-debugging')).toBeDefined();
    expect(screen.getByTestId('chain-row-mode:reviewer')).toBeDefined();
    expect(screen.getByTestId('chain-row-default')).toBeDefined();
  });

  it('marks existing candidates as chain-step-chosen and missing as chain-step-unknown (Truth 10)', () => {
    render(
      <RoutingChainsCard
        resolvedChains={{
          'skill:X': [
            { candidate: 'a', exists: true },
            { candidate: 'b', exists: false },
          ],
        }}
        decisions={[]}
      />
    );
    const row = screen.getByTestId('chain-row-skill:X');
    const chosen = within(row).getAllByTestId('chain-step-chosen');
    const unknown = within(row).getAllByTestId('chain-step-unknown');
    expect(chosen.length).toBe(1);
    expect(unknown.length).toBe(1);
    expect(chosen[0]?.textContent).toContain('a');
    expect(unknown[0]?.textContent).toContain('b');
  });

  it('renders currently-chosen-{key} from the latest decision matching the use-case', () => {
    const decisions: RoutingDecision[] = [
      {
        timestamp: new Date().toISOString(),
        useCase: { kind: 'skill', skillName: 'X' },
        resolutionPath: [],
        backendName: 'a',
        backendType: 'anthropic',
        durationMs: 1,
      },
    ];
    render(
      <RoutingChainsCard
        resolvedChains={{ 'skill:X': [{ candidate: 'a', exists: true }] }}
        decisions={decisions}
      />
    );
    expect(screen.getByTestId('currently-chosen-skill:X').textContent).toContain('a');
  });
});
