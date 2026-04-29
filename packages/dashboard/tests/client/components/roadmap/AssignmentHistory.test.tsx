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
