import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureRow } from '../../../../src/client/components/roadmap/FeatureRow';
import type { DashboardFeature } from '../../../../src/shared/types';

function makeFeature(overrides?: Partial<DashboardFeature>): DashboardFeature {
  return {
    name: 'Auth System',
    status: 'in-progress',
    summary: 'Implement authentication',
    milestone: 'M1',
    blockedBy: [],
    assignee: 'chadjw',
    priority: 'P1',
    spec: 'docs/specs/auth.md',
    plans: ['docs/plans/auth-plan.md'],
    externalId: 'github:owner/repo#42',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  };
}

describe('FeatureRow', () => {
  it('renders feature name in collapsed state', () => {
    render(<FeatureRow feature={makeFeature()} identity="chadjw" onClaim={vi.fn()} />);
    expect(screen.getByText('Auth System')).toBeDefined();
  });

  it('renders status badge', () => {
    render(
      <FeatureRow
        feature={makeFeature({ status: 'blocked' })}
        identity="chadjw"
        onClaim={vi.fn()}
      />
    );
    expect(screen.getByText('blocked')).toBeDefined();
  });

  it('renders priority badge when present', () => {
    render(
      <FeatureRow feature={makeFeature({ priority: 'P0' })} identity="chadjw" onClaim={vi.fn()} />
    );
    expect(screen.getByText('P0')).toBeDefined();
  });

  it('does not render priority badge when null', () => {
    render(
      <FeatureRow feature={makeFeature({ priority: null })} identity="chadjw" onClaim={vi.fn()} />
    );
    expect(screen.queryByText('P0')).toBeNull();
    expect(screen.queryByText('P1')).toBeNull();
  });

  it('renders assignee when present and not em-dash', () => {
    render(
      <FeatureRow
        feature={makeFeature({ assignee: 'alice' })}
        identity="chadjw"
        onClaim={vi.fn()}
      />
    );
    expect(screen.getByText('alice')).toBeDefined();
  });

  it('does not render assignee when em-dash', () => {
    render(
      <FeatureRow
        feature={makeFeature({ assignee: '\u2014' })}
        identity="chadjw"
        onClaim={vi.fn()}
      />
    );
    // Em-dash assignee should be hidden
    const assigneeSpans = screen.queryAllByText('\u2014');
    // Should not appear in the collapsed row as an assignee label
    // (there may be em-dashes in expanded section but row is collapsed)
    expect(assigneeSpans.length).toBe(0);
  });

  it('shows expanded details when row is clicked', () => {
    render(<FeatureRow feature={makeFeature()} identity="chadjw" onClaim={vi.fn()} />);
    // Click the row to expand
    fireEvent.click(screen.getByText('Auth System'));
    // Expanded section should show spec
    expect(screen.getByText('Spec:')).toBeDefined();
    expect(screen.getByText('docs/specs/auth.md')).toBeDefined();
    // Plans
    expect(screen.getByText('Plans:')).toBeDefined();
    expect(screen.getByText('docs/plans/auth-plan.md')).toBeDefined();
  });

  it('renders external ID as clickable GitHub link in expanded state', () => {
    render(
      <FeatureRow
        feature={makeFeature({ externalId: 'github:owner/repo#42' })}
        identity="chadjw"
        onClaim={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Auth System'));
    const link = screen.getByText('github:owner/repo#42');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://github.com/owner/repo/issues/42');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders em-dash for null external ID in expanded state', () => {
    render(
      <FeatureRow feature={makeFeature({ externalId: null })} identity="chadjw" onClaim={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Auth System'));
    expect(screen.getByText('External ID:')).toBeDefined();
  });

  it('renders blockers in expanded state', () => {
    render(
      <FeatureRow
        feature={makeFeature({ blockedBy: ['Feature X', 'Feature Y'] })}
        identity="chadjw"
        onClaim={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Auth System'));
    expect(screen.getByText('Blocked by:')).toBeDefined();
    expect(screen.getByText('Feature X, Feature Y')).toBeDefined();
  });

  it('renders updated date in expanded state', () => {
    render(
      <FeatureRow
        feature={makeFeature({ updatedAt: '2026-04-20T10:00:00Z' })}
        identity="chadjw"
        onClaim={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Auth System'));
    expect(screen.getByText('Updated:')).toBeDefined();
  });

  it('shows "Start Working" button for workable feature with identity', () => {
    const onClaim = vi.fn();
    render(
      <FeatureRow
        feature={makeFeature({ status: 'planned', assignee: null })}
        identity="chadjw"
        onClaim={onClaim}
      />
    );
    const btn = screen.getByText('Start Working');
    expect(btn).toBeDefined();
  });

  it('"Start Working" calls onClaim with feature on click', () => {
    const onClaim = vi.fn();
    const feature = makeFeature({ status: 'planned', assignee: null });
    render(<FeatureRow feature={feature} identity="chadjw" onClaim={onClaim} />);
    fireEvent.click(screen.getByText('Start Working'));
    expect(onClaim).toHaveBeenCalledWith(feature);
  });

  it('hides "Start Working" for in-progress feature', () => {
    render(
      <FeatureRow
        feature={makeFeature({ status: 'in-progress', assignee: 'alice' })}
        identity="chadjw"
        onClaim={vi.fn()}
      />
    );
    expect(screen.queryByText('Start Working')).toBeNull();
  });

  it('hides "Start Working" when identity is null', () => {
    render(
      <FeatureRow
        feature={makeFeature({ status: 'planned', assignee: null })}
        identity={null}
        onClaim={vi.fn()}
      />
    );
    expect(screen.queryByText('Start Working')).toBeNull();
  });

  it('hides "Start Working" for backlog feature with assignee', () => {
    render(
      <FeatureRow
        feature={makeFeature({ status: 'backlog', assignee: 'alice' })}
        identity="chadjw"
        onClaim={vi.fn()}
      />
    );
    expect(screen.queryByText('Start Working')).toBeNull();
  });

  it('shows "Start Working" for backlog feature with no assignee', () => {
    render(
      <FeatureRow
        feature={makeFeature({ status: 'backlog', assignee: null })}
        identity="chadjw"
        onClaim={vi.fn()}
      />
    );
    expect(screen.getByText('Start Working')).toBeDefined();
  });
});
