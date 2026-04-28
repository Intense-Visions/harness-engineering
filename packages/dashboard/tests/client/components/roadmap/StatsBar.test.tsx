import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsBar } from '../../../../src/client/components/roadmap/StatsBar';
import type { RoadmapData } from '../../../../src/shared/types';

function makeRoadmapData(overrides?: Partial<RoadmapData>): RoadmapData {
  return {
    milestones: [],
    features: [],
    assignmentHistory: [],
    totalFeatures: 25,
    totalDone: 8,
    totalInProgress: 5,
    totalPlanned: 6,
    totalBlocked: 3,
    totalBacklog: 3,
    ...overrides,
  };
}

describe('StatsBar', () => {
  it('renders all six stat labels', () => {
    const data = makeRoadmapData();
    render(<StatsBar data={data} />);
    expect(screen.getByText('Total')).toBeDefined();
    expect(screen.getByText('Done')).toBeDefined();
    expect(screen.getByText('In Progress')).toBeDefined();
    expect(screen.getByText('Planned')).toBeDefined();
    expect(screen.getByText('Blocked')).toBeDefined();
    expect(screen.getByText('Backlog')).toBeDefined();
  });

  it('renders correct numeric values from RoadmapData', () => {
    const data = makeRoadmapData({
      totalFeatures: 42,
      totalDone: 10,
      totalInProgress: 7,
      totalPlanned: 12,
      totalBlocked: 5,
      totalBacklog: 8,
    });
    render(<StatsBar data={data} />);
    expect(screen.getByText('42')).toBeDefined();
    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('8')).toBeDefined();
  });

  it('renders zero counts without crashing', () => {
    const data = makeRoadmapData({
      totalFeatures: 0,
      totalDone: 0,
      totalInProgress: 0,
      totalPlanned: 0,
      totalBlocked: 0,
      totalBacklog: 0,
    });
    const { container } = render(<StatsBar data={data} />);
    const zeros = container.querySelectorAll('.text-lg');
    expect(zeros.length).toBe(6);
    zeros.forEach((el) => expect(el.textContent).toBe('0'));
  });
});
