import { describe, it, expect } from 'vitest';
import { syncFromExternal } from '../../src/roadmap/sync-engine';
import { assigneeInvariantHolds } from '../../src/roadmap/assignee-lifecycle';
import type { Roadmap, TrackerSyncConfig, ExternalTicketState } from '@harness-engineering/types';

/**
 * bug-fleet A1 reproduction.
 *
 * `assignee-lifecycle` declares one invariant — `assignee ≠ null ⟺ in-progress` —
 * and `health.checkRoadmapHealth` treats a breach as RMH005, error severity.
 *
 * `applyTicketToFeature` guards ONE direction of it: when inbound sync moves an
 * ASSIGNED row away from in-progress it routes through `setStatus` so the assignee
 * is released. The opposite direction is unguarded: an open ticket carrying the
 * `in-progress` label but NO tracker assignee resolves to `in-progress` and lands
 * via the bare `feature.status = newStatus` write at the end of the function,
 * leaving the row `in-progress` with `assignee: null`.
 *
 * A labelled-but-unassigned issue is the ordinary state of a GitHub issue, so this
 * manufactures an error-severity health violation on routine sync input.
 */
function roadmapWithUnassignedPlannedRow(): Roadmap {
  return {
    frontmatter: { project: 'demo', version: 1, lastSynced: 'x', lastManualEdit: 'x' },
    milestones: [
      {
        name: 'Theme',
        isBacklog: false,
        features: [
          {
            name: 'A',
            status: 'planned',
            spec: 'docs/a.md',
            plans: [],
            blockedBy: [],
            summary: '',
            assignee: null,
            priority: null,
            externalId: 'github:o/r#1',
            updatedAt: null,
          },
        ],
      },
    ],
    assignmentHistory: [],
  };
}

const CONFIG = {
  kind: 'github',
  repo: 'o/r',
  statusMap: {
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    blocked: 'open',
    'needs-human': 'open',
    done: 'closed',
  },
  reverseStatusMap: { closed: 'done', 'open:in-progress': 'in-progress' },
} as unknown as TrackerSyncConfig;

const OPEN_IN_PROGRESS_UNASSIGNED_TICKET = [
  { externalId: 'github:o/r#1', status: 'open', assignee: null, labels: ['in-progress'] },
] as unknown as ExternalTicketState[];

describe('syncFromExternal — inbound in-progress with no tracker assignee', () => {
  it('does not leave the row in-progress with a null assignee (RMH005)', async () => {
    const roadmap = roadmapWithUnassignedPlannedRow();
    const adapter = {
      fetchAllTickets: async () => ({ ok: true as const, value: OPEN_IN_PROGRESS_UNASSIGNED_TICKET }),
    } as never;

    await syncFromExternal(
      roadmap,
      adapter,
      CONFIG,
      {},
      OPEN_IN_PROGRESS_UNASSIGNED_TICKET
    );

    const feature = roadmap.milestones[0]!.features[0]!;
    expect(assigneeInvariantHolds(feature)).toBe(true);
  });
});
