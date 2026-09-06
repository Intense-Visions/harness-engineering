import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { syncRoadmap } from '../../src/roadmap/sync';
import type { Roadmap } from '@harness-engineering/types';

/**
 * bug-fleet A1 reproduction.
 *
 * `collectAutopilotStatuses` (roadmap/sync.ts) links an autopilot phase to a
 * roadmap row with an UNANCHORED suffix test:
 *
 *   featurePlans.some((p) => p === phase.planPath || phase.planPath!.endsWith(p))
 *
 * `endsWith` has no path-segment boundary, so a phase whose `planPath` merely ENDS
 * with the feature's plan string as a substring is treated as that feature's phase.
 * `'docs/changes/multi-auth/plan.md'.endsWith('auth/plan.md')` is true, so the
 * completion of the unrelated `multi-auth` work is aggregated into the `Auth`
 * row's task statuses and `inferStatus` proposes `planned → done` for a feature
 * nothing was executed against.
 *
 * The intended tolerance is relative-vs-absolute path forms; matching must break
 * on a path separator, not mid-segment.
 */
let projectPath: string;

beforeAll(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'bugfleet-plan-suffix-'));
  const sessionDir = path.join(projectPath, '.harness', 'sessions', 's1');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, 'autopilot-state.json'),
    JSON.stringify({
      phases: [
        { name: 'phase-1', planPath: 'docs/changes/multi-auth/plan.md', status: 'complete' },
      ],
    })
  );
});

afterAll(() => {
  fs.rmSync(projectPath, { recursive: true, force: true });
});

function roadmapWithAuthRow(): Roadmap {
  return {
    frontmatter: { project: 'demo', version: 1, lastSynced: 'x', lastManualEdit: 'x' },
    milestones: [
      {
        name: 'Theme',
        isBacklog: false,
        features: [
          {
            name: 'Auth',
            status: 'planned',
            spec: null,
            // This row's OWN plan. No phase in the session state references it.
            plans: ['auth/plan.md'],
            blockedBy: [],
            summary: '',
            assignee: null,
            priority: null,
            externalId: null,
            updatedAt: null,
          },
        ],
      },
    ],
    assignmentHistory: [],
  };
}

describe('syncRoadmap — autopilot plan-path linkage', () => {
  it('does not link a phase whose planPath only shares a mid-segment suffix', async () => {
    const result = await syncRoadmap({ projectPath, roadmap: roadmapWithAuthRow() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});
