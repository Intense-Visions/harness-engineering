# Plan: Roadmap Page Client Components -- Test Coverage

**Date:** 2026-04-28 | **Spec:** docs/changes/roadmap-page-enhancement/proposal.md | **Tasks:** 7 | **Time:** ~30 min | **Integration Tier:** medium

## Goal

Add comprehensive test coverage for the five roadmap client components (StatsBar, FeatureTable, FeatureRow, ClaimConfirmation, AssignmentHistory) that were implemented during Phase 1 but have zero tests.

## Context

All five Phase 2 components already exist as fully implemented production code:

- `packages/dashboard/src/client/components/roadmap/StatsBar.tsx` (29 lines)
- `packages/dashboard/src/client/components/roadmap/FeatureTable.tsx` (127 lines)
- `packages/dashboard/src/client/components/roadmap/FeatureRow.tsx` (158 lines)
- `packages/dashboard/src/client/components/roadmap/ClaimConfirmation.tsx` (109 lines)
- `packages/dashboard/src/client/components/roadmap/AssignmentHistory.tsx` (45 lines)

They are already wired into `Roadmap.tsx` (which imports and renders them). The Roadmap.tsx page integration was done during Phase 1 execution. No component code changes are required -- only test files need to be created.

## Observable Truths (Acceptance Criteria)

1. When `pnpm vitest run --project client` is executed in the dashboard package, all new roadmap component tests pass
2. StatsBar tests verify: all six stat labels render, correct values from RoadmapData are displayed, correct color classes are applied
3. FeatureTable tests verify: features are grouped by milestone, milestone sections are collapsible, filters (milestone, status, workable-only) correctly narrow displayed features, empty state message renders when no features match
4. FeatureRow tests verify: collapsed row shows name/status/priority/assignee/summary, expanded row shows spec/plans/externalId/blockedBy/updatedAt, "Start Working" button appears only for workable items (planned/backlog + no assignee), "Start Working" button is hidden when identity is null, external ID renders as clickable GitHub link
5. ClaimConfirmation tests verify: correct workflow detection (no spec -> brainstorming, spec + no plan -> planning, plan exists -> execution), confirm POSTs to /api/actions/roadmap/claim, cancel calls onCancel, error state renders on failed claim, loading state disables buttons
6. AssignmentHistory tests verify: table renders with feature/assignee/action/date columns, correct action color classes applied, returns null for empty records
7. All existing 204 dashboard tests continue to pass

## File Map

```
CREATE packages/dashboard/tests/client/components/roadmap/StatsBar.test.tsx
CREATE packages/dashboard/tests/client/components/roadmap/FeatureTable.test.tsx
CREATE packages/dashboard/tests/client/components/roadmap/FeatureRow.test.tsx
CREATE packages/dashboard/tests/client/components/roadmap/ClaimConfirmation.test.tsx
CREATE packages/dashboard/tests/client/components/roadmap/AssignmentHistory.test.tsx
```

## Uncertainties

- [ASSUMPTION] The jsdom environment in the client vitest project handles the component renders correctly. The existing BlastRadiusGraph.test.tsx and Attention.test.tsx prove this pattern works.
- [DEFERRABLE] framer-motion is not used by any roadmap components, so no mock needed (unlike DependencyGraph).

## Tasks

### Task 1: Create test fixtures module with shared helpers and data factories

**Depends on:** none | **Files:** packages/dashboard/tests/client/components/roadmap/StatsBar.test.tsx

1. Create `packages/dashboard/tests/client/components/roadmap/StatsBar.test.tsx`:

```tsx
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
```

2. Run: `cd packages/dashboard && pnpm vitest run --project client tests/client/components/roadmap/StatsBar.test.tsx`
3. Observe pass (3 tests).
4. Run: `pnpm harness validate`
5. Commit: `test(dashboard): add StatsBar component tests`

---

### Task 2: Add AssignmentHistory component tests

**Depends on:** none | **Files:** packages/dashboard/tests/client/components/roadmap/AssignmentHistory.test.tsx

1. Create `packages/dashboard/tests/client/components/roadmap/AssignmentHistory.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssignmentHistory } from '../../../../src/client/components/roadmap/AssignmentHistory';
import type { DashboardAssignmentRecord } from '../../../../src/shared/types';

function makeRecord(overrides?: Partial<DashboardAssignmentRecord>): DashboardAssignmentRecord {
  return {
    feature: 'Auth system',
    assignee: 'chadjw',
    action: 'assigned',
    date: '2026-04-20',
    ...overrides,
  };
}

describe('AssignmentHistory', () => {
  it('returns null for empty records', () => {
    const { container } = render(<AssignmentHistory records={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders table headers', () => {
    render(<AssignmentHistory records={[makeRecord()]} />);
    expect(screen.getByText('Feature')).toBeDefined();
    expect(screen.getByText('Assignee')).toBeDefined();
    expect(screen.getByText('Action')).toBeDefined();
    expect(screen.getByText('Date')).toBeDefined();
  });

  it('renders record data in table rows', () => {
    const records = [
      makeRecord({
        feature: 'Feature A',
        assignee: 'alice',
        action: 'assigned',
        date: '2026-04-15',
      }),
      makeRecord({
        feature: 'Feature B',
        assignee: 'bob',
        action: 'completed',
        date: '2026-04-18',
      }),
    ];
    render(<AssignmentHistory records={records} />);
    expect(screen.getByText('Feature A')).toBeDefined();
    expect(screen.getByText('alice')).toBeDefined();
    expect(screen.getByText('Feature B')).toBeDefined();
    expect(screen.getByText('bob')).toBeDefined();
  });

  it('applies correct color class for assigned action', () => {
    render(<AssignmentHistory records={[makeRecord({ action: 'assigned' })]} />);
    const actionCell = screen.getByText('assigned');
    expect(actionCell.className).toContain('text-blue-400');
  });

  it('applies correct color class for completed action', () => {
    render(<AssignmentHistory records={[makeRecord({ action: 'completed' })]} />);
    const actionCell = screen.getByText('completed');
    expect(actionCell.className).toContain('text-emerald-400');
  });

  it('applies correct color class for unassigned action', () => {
    render(<AssignmentHistory records={[makeRecord({ action: 'unassigned' })]} />);
    const actionCell = screen.getByText('unassigned');
    expect(actionCell.className).toContain('text-gray-400');
  });
});
```

2. Run: `cd packages/dashboard && pnpm vitest run --project client tests/client/components/roadmap/AssignmentHistory.test.tsx`
3. Observe pass (6 tests).
4. Run: `pnpm harness validate`
5. Commit: `test(dashboard): add AssignmentHistory component tests`

---

### Task 3: Add FeatureRow component tests (collapsed and expanded states)

**Depends on:** none | **Files:** packages/dashboard/tests/client/components/roadmap/FeatureRow.test.tsx

1. Create `packages/dashboard/tests/client/components/roadmap/FeatureRow.test.tsx`:

```tsx
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
```

2. Run: `cd packages/dashboard && pnpm vitest run --project client tests/client/components/roadmap/FeatureRow.test.tsx`
3. Observe pass (17 tests).
4. Run: `pnpm harness validate`
5. Commit: `test(dashboard): add FeatureRow component tests with collapsed/expanded/workable states`

---

### Task 4: Add FeatureTable component tests (grouping, filtering, accordion)

**Depends on:** none | **Files:** packages/dashboard/tests/client/components/roadmap/FeatureTable.test.tsx

1. Create `packages/dashboard/tests/client/components/roadmap/FeatureTable.test.tsx`:

```tsx
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
```

2. Run: `cd packages/dashboard && pnpm vitest run --project client tests/client/components/roadmap/FeatureTable.test.tsx`
3. Observe pass (10 tests).
4. Run: `pnpm harness validate`
5. Commit: `test(dashboard): add FeatureTable component tests with grouping, filtering, accordion`

---

### Task 5: Add ClaimConfirmation component tests (workflow detection, claim flow, error handling)

**Depends on:** none | **Files:** packages/dashboard/tests/client/components/roadmap/ClaimConfirmation.test.tsx

1. Create `packages/dashboard/tests/client/components/roadmap/ClaimConfirmation.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClaimConfirmation } from '../../../../src/client/components/roadmap/ClaimConfirmation';
import type { DashboardFeature, ClaimResponse } from '../../../../src/shared/types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeFeature(overrides?: Partial<DashboardFeature>): DashboardFeature {
  return {
    name: 'Auth System',
    status: 'planned',
    summary: 'Implement authentication',
    milestone: 'M1',
    blockedBy: [],
    assignee: null,
    priority: 'P1',
    spec: null,
    plans: [],
    externalId: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeClaimResponse(overrides?: Partial<ClaimResponse>): ClaimResponse {
  return {
    ok: true,
    feature: 'Auth System',
    status: 'in-progress',
    assignee: 'chadjw',
    workflow: 'brainstorming',
    githubSynced: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('ClaimConfirmation', () => {
  it('displays feature name', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ name: 'My Feature' })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('My Feature')).toBeDefined();
  });

  it('displays identity username', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('chadjw')).toBeDefined();
  });

  it('detects brainstorming workflow when no spec', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: null, plans: [] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Brainstorming')).toBeDefined();
    expect(screen.getByText(/No spec found/)).toBeDefined();
  });

  it('detects brainstorming workflow when spec is em-dash', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: '\u2014', plans: [] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Brainstorming')).toBeDefined();
  });

  it('detects planning workflow when spec exists but no plans', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: 'docs/specs/auth.md', plans: [] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Planning')).toBeDefined();
    expect(screen.getByText(/Spec exists but no plan/)).toBeDefined();
  });

  it('detects planning workflow when plans is em-dash', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: 'docs/specs/auth.md', plans: ['\u2014'] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Planning')).toBeDefined();
  });

  it('detects execution workflow when spec and plans exist', () => {
    render(
      <ClaimConfirmation
        feature={makeFeature({ spec: 'docs/specs/auth.md', plans: ['docs/plans/auth-plan.md'] })}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Execution')).toBeDefined();
    expect(screen.getByText(/Spec and plan exist/)).toBeDefined();
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('POSTs to claim endpoint on confirm and calls onConfirm with response', async () => {
    const response = makeClaimResponse({ workflow: 'brainstorming' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => response,
    });
    const onConfirm = vi.fn();

    render(
      <ClaimConfirmation
        feature={makeFeature({ name: 'Auth System' })}
        identity="chadjw"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/actions/roadmap/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: 'Auth System', assignee: 'chadjw' }),
      });
      expect(onConfirm).toHaveBeenCalledWith(response);
    });
  });

  it('shows error message on failed claim', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Feature already claimed' }),
    });

    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(screen.getByText('Feature already claimed')).toBeDefined();
    });
  });

  it('shows network error on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('shows loading state while claiming', async () => {
    // Create a deferred promise to control resolution timing
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    render(
      <ClaimConfirmation
        feature={makeFeature()}
        identity="chadjw"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(screen.getByText(/Claiming/)).toBeDefined();
    });

    // Resolve to clean up
    resolveFetch({
      ok: true,
      json: async () => makeClaimResponse(),
    });
  });
});
```

2. Run: `cd packages/dashboard && pnpm vitest run --project client tests/client/components/roadmap/ClaimConfirmation.test.tsx`
3. Observe pass (12 tests).
4. Run: `pnpm harness validate`
5. Commit: `test(dashboard): add ClaimConfirmation tests with workflow detection and claim flow`

---

### Task 6: Run full dashboard test suite to verify no regressions

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5 | **Files:** none (verification only)

1. Run: `cd packages/dashboard && pnpm vitest run`
2. Verify all tests pass (expect 204 existing + ~48 new = ~252 total).
3. Run: `pnpm harness validate`

---

### Task 7: Verify typecheck passes

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5 | **Files:** none (verification only)

1. Run: `cd packages/dashboard && pnpm typecheck`
2. Verify no type errors in new test files.
3. Commit only if any fixups were needed; otherwise no commit for this task.
