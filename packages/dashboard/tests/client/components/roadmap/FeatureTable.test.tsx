import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureTable } from '../../../../src/client/components/roadmap/FeatureTable';
import type { DashboardFeature, MilestoneProgress } from '../../../../src/shared/types';

function makeFeature(overrides?: Partial<DashboardFeature>): DashboardFeature {
  return {
    name: 'Feature Alpha',
    status: 'planned',
    summary: 'Alpha summary',
    milestone: 'Milestone 1',
    blockedBy: [],
    assignee: null,
    priority: 'P2',
    spec: null,
    plans: [],
    externalId: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeMilestone(overrides?: Partial<MilestoneProgress>): MilestoneProgress {
  return {
    name: 'Milestone 1',
    isBacklog: false,
    total: 5,
    done: 2,
    inProgress: 1,
    planned: 1,
    blocked: 1,
    backlog: 0,
    needsHuman: 0,
    ...overrides,
  };
}

const defaultProps = {
  filterMilestone: '',
  filterStatus: '',
  workableOnly: false,
  identity: 'chadjw',
  onClaim: vi.fn(),
};

describe('FeatureTable', () => {
  it('groups features by milestone', () => {
    const features = [
      makeFeature({ name: 'F1', milestone: 'M1' }),
      makeFeature({ name: 'F2', milestone: 'M2' }),
      makeFeature({ name: 'F3', milestone: 'M1' }),
    ];
    const milestones = [
      makeMilestone({ name: 'M1', total: 2, done: 0 }),
      makeMilestone({ name: 'M2', total: 1, done: 0 }),
    ];
    render(<FeatureTable {...defaultProps} features={features} milestones={milestones} />);
    expect(screen.getByText('M1')).toBeDefined();
    expect(screen.getByText('M2')).toBeDefined();
  });

  it('shows milestone progress fraction (done/total)', () => {
    const features = [makeFeature({ name: 'F1', milestone: 'M1' })];
    const milestones = [makeMilestone({ name: 'M1', total: 5, done: 2 })];
    render(<FeatureTable {...defaultProps} features={features} milestones={milestones} />);
    expect(screen.getByText('2/5')).toBeDefined();
  });

  it('renders empty state message when no features match filters', () => {
    render(<FeatureTable {...defaultProps} features={[]} milestones={[]} />);
    expect(screen.getByText(/No features match/)).toBeDefined();
  });

  it('filters by milestone', () => {
    const features = [
      makeFeature({ name: 'F1', milestone: 'M1' }),
      makeFeature({ name: 'F2', milestone: 'M2' }),
    ];
    const milestones = [makeMilestone({ name: 'M1' }), makeMilestone({ name: 'M2' })];
    render(
      <FeatureTable
        {...defaultProps}
        features={features}
        milestones={milestones}
        filterMilestone="M1"
      />
    );
    expect(screen.getByText('F1')).toBeDefined();
    expect(screen.queryByText('F2')).toBeNull();
  });

  it('filters by status', () => {
    const features = [
      makeFeature({ name: 'F1', status: 'planned' }),
      makeFeature({ name: 'F2', status: 'blocked' }),
    ];
    const milestones = [makeMilestone({ name: 'Milestone 1' })];
    render(
      <FeatureTable
        {...defaultProps}
        features={features}
        milestones={milestones}
        filterStatus="blocked"
      />
    );
    expect(screen.queryByText('F1')).toBeNull();
    expect(screen.getByText('F2')).toBeDefined();
  });

  it('hides done features by default (no status filter)', () => {
    const features = [
      makeFeature({ name: 'Active', status: 'in-progress' }),
      makeFeature({ name: 'Completed', status: 'done' }),
    ];
    const milestones = [makeMilestone({ name: 'Milestone 1' })];
    render(
      <FeatureTable {...defaultProps} features={features} milestones={milestones} filterStatus="" />
    );
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.queryByText('Completed')).toBeNull();
  });

  it('shows done features when status filter is "done"', () => {
    const features = [
      makeFeature({ name: 'Active', status: 'in-progress' }),
      makeFeature({ name: 'Completed', status: 'done' }),
    ];
    const milestones = [makeMilestone({ name: 'Milestone 1' })];
    render(
      <FeatureTable
        {...defaultProps}
        features={features}
        milestones={milestones}
        filterStatus="done"
      />
    );
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.getByText('Completed')).toBeDefined();
  });

  it('workable-only filter shows only planned/backlog with no assignee', () => {
    const features = [
      makeFeature({ name: 'Workable', status: 'planned', assignee: null }),
      makeFeature({ name: 'Assigned', status: 'planned', assignee: 'alice' }),
      makeFeature({ name: 'InProgress', status: 'in-progress', assignee: null }),
    ];
    const milestones = [makeMilestone({ name: 'Milestone 1' })];
    render(
      <FeatureTable
        {...defaultProps}
        features={features}
        milestones={milestones}
        workableOnly={true}
      />
    );
    expect(screen.getByText('Workable')).toBeDefined();
    expect(screen.queryByText('Assigned')).toBeNull();
    expect(screen.queryByText('InProgress')).toBeNull();
  });

  it('milestone section collapses on click', () => {
    const features = [makeFeature({ name: 'F1', milestone: 'M1' })];
    const milestones = [makeMilestone({ name: 'M1' })];
    render(<FeatureTable {...defaultProps} features={features} milestones={milestones} />);
    // Feature visible initially (sections start expanded)
    expect(screen.getByText('F1')).toBeDefined();
    // Click milestone header to collapse
    fireEvent.click(screen.getByText('M1'));
    // Feature should be hidden
    expect(screen.queryByText('F1')).toBeNull();
  });

  it('milestone section expands again on second click', () => {
    const features = [makeFeature({ name: 'F1', milestone: 'M1' })];
    const milestones = [makeMilestone({ name: 'M1' })];
    render(<FeatureTable {...defaultProps} features={features} milestones={milestones} />);
    // Collapse
    fireEvent.click(screen.getByText('M1'));
    expect(screen.queryByText('F1')).toBeNull();
    // Expand
    fireEvent.click(screen.getByText('M1'));
    expect(screen.getByText('F1')).toBeDefined();
  });
});
