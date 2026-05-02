# Plan: Roadmap Pilot Skill (Phase 4)

**Date:** 2026-04-02
**Spec:** docs/changes/roadmap-sync-pilot/proposal.md
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Implement the auto-pick pilot skill that scores unblocked roadmap items, recommends the highest-impact one to the human, assigns it, and transitions to brainstorming or autopilot.

## Observable Truths (Acceptance Criteria)

1. When `scoreRoadmapCandidates()` is called with a roadmap containing mixed priority/no-priority items, it shall return candidates sorted by two-tier sort: explicit priority first (P0 > P1 > P2 > P3), then weighted score (position 0.5, dependents 0.3, affinity 0.2) within each tier.
2. When `scoreRoadmapCandidates()` is called with a roadmap containing blocked items or items with status other than `planned`/`backlog`, those items shall not appear in the returned candidates.
3. When computing affinity, the system shall read the assignment history and give a scoring bonus to candidates whose blockers or milestone siblings were previously completed by the current user.
4. When `assignFeature()` is called on an unassigned feature, it shall set the `assignee` field and append one `assigned` record to the assignment history.
5. When `assignFeature()` is called on a feature already assigned to a different person, it shall append two records: `unassigned` for the previous assignee and `assigned` for the new assignee (SC15).
6. When `pnpm --filter @harness-engineering/core test -- --run tests/roadmap/pilot-scoring.test.ts` runs, all tests pass.
7. The skill directory `agents/skills/claude-code/harness-roadmap-pilot/` shall contain `SKILL.md` and `skill.yaml` files.
8. The SKILL.md shall instruct the AI to transition to `harness:brainstorming` when the selected feature has no spec, or to `harness:autopilot` when a spec exists, via `emit_interaction`.
9. `harness validate` passes after all changes.

## File Map

- CREATE `packages/core/src/roadmap/pilot-scoring.ts`
- CREATE `packages/core/tests/roadmap/pilot-scoring.test.ts`
- MODIFY `packages/core/src/roadmap/index.ts` (add exports)
- CREATE `agents/skills/claude-code/harness-roadmap-pilot/SKILL.md`
- CREATE `agents/skills/claude-code/harness-roadmap-pilot/skill.yaml`

## Tasks

### Task 1: Define scoring types and implement `scoreRoadmapCandidates` (TDD)

**Depends on:** none
**Files:** `packages/core/tests/roadmap/pilot-scoring.test.ts`, `packages/core/src/roadmap/pilot-scoring.ts`

1. Create test file `packages/core/tests/roadmap/pilot-scoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  scoreRoadmapCandidates,
  type ScoredCandidate,
  type PilotScoringOptions,
} from '../../src/roadmap/pilot-scoring';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';

function makeFeature(overrides?: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name: 'Test Feature',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'A test feature',
    assignee: null,
    priority: null,
    externalId: null,
    ...overrides,
  };
}

function makeRoadmap(
  milestoneFeatures: Array<{ name: string; isBacklog: boolean; features: RoadmapFeature[] }>
): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-04-01T00:00:00Z',
      lastManualEdit: '2026-04-01T00:00:00Z',
    },
    milestones: milestoneFeatures.map((m) => ({
      name: m.name,
      isBacklog: m.isBacklog,
      features: m.features,
    })),
    assignmentHistory: [],
  };
}

describe('scoreRoadmapCandidates()', () => {
  describe('filtering', () => {
    it('includes only planned and backlog items', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Planned', status: 'planned' }),
            makeFeature({ name: 'InProgress', status: 'in-progress' }),
            makeFeature({ name: 'Done', status: 'done' }),
            makeFeature({ name: 'Blocked', status: 'blocked' }),
          ],
        },
        {
          name: 'Backlog',
          isBacklog: true,
          features: [makeFeature({ name: 'BacklogItem', status: 'backlog' })],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      const names = candidates.map((c) => c.feature.name);
      expect(names).toContain('Planned');
      expect(names).toContain('BacklogItem');
      expect(names).not.toContain('InProgress');
      expect(names).not.toContain('Done');
      expect(names).not.toContain('Blocked');
    });

    it('excludes items with unresolved blockers', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Dependency', status: 'in-progress' }),
            makeFeature({ name: 'Blocked', status: 'planned', blockedBy: ['Dependency'] }),
            makeFeature({ name: 'Free', status: 'planned' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      const names = candidates.map((c) => c.feature.name);
      expect(names).toContain('Free');
      expect(names).not.toContain('Blocked');
      expect(names).not.toContain('Dependency');
    });

    it('includes items whose blockers are done', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Dep', status: 'done' }),
            makeFeature({ name: 'Unblocked', status: 'planned', blockedBy: ['Dep'] }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.feature.name).toBe('Unblocked');
    });

    it('returns empty array when no candidates exist', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [makeFeature({ name: 'Done', status: 'done' })],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates).toHaveLength(0);
    });
  });

  describe('two-tier sorting', () => {
    it('sorts priority items before non-priority items', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'NoPrio', status: 'planned', priority: null }),
            makeFeature({ name: 'P2', status: 'planned', priority: 'P2' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates[0]!.feature.name).toBe('P2');
      expect(candidates[1]!.feature.name).toBe('NoPrio');
    });

    it('sorts P0 before P1 before P2 before P3', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'P3', status: 'planned', priority: 'P3' }),
            makeFeature({ name: 'P0', status: 'planned', priority: 'P0' }),
            makeFeature({ name: 'P1', status: 'planned', priority: 'P1' }),
            makeFeature({ name: 'P2', status: 'planned', priority: 'P2' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates.map((c) => c.feature.name)).toEqual(['P0', 'P1', 'P2', 'P3']);
    });

    it('uses weighted score within same priority tier', () => {
      // Two P1 items: first in milestone (position 0) should score higher than second (position 1)
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'First', status: 'planned', priority: 'P1' }),
            makeFeature({ name: 'Second', status: 'planned', priority: 'P1' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates[0]!.feature.name).toBe('First');
      expect(candidates[1]!.feature.name).toBe('Second');
    });
  });

  describe('position scoring', () => {
    it('scores earlier milestone items higher than later milestone items', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [makeFeature({ name: 'Early', status: 'planned' })],
        },
        {
          name: 'M2',
          isBacklog: false,
          features: [makeFeature({ name: 'Late', status: 'planned' })],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates[0]!.feature.name).toBe('Early');
      expect(candidates[0]!.positionScore).toBeGreaterThan(candidates[1]!.positionScore);
    });

    it('scores earlier features within milestone higher', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'First', status: 'planned' }),
            makeFeature({ name: 'Second', status: 'planned' }),
            makeFeature({ name: 'Third', status: 'planned' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      expect(candidates[0]!.positionScore).toBeGreaterThan(candidates[1]!.positionScore);
      expect(candidates[1]!.positionScore).toBeGreaterThan(candidates[2]!.positionScore);
    });
  });

  describe('dependents scoring', () => {
    it('scores items that unblock more downstream items higher', () => {
      const roadmap = makeRoadmap([
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Enabler', status: 'planned' }),
            makeFeature({ name: 'DepA', status: 'planned', blockedBy: ['Enabler'] }),
            makeFeature({ name: 'DepB', status: 'planned', blockedBy: ['Enabler'] }),
            makeFeature({ name: 'Leaf', status: 'planned' }),
          ],
        },
      ]);

      const candidates = scoreRoadmapCandidates(roadmap);
      const enabler = candidates.find((c) => c.feature.name === 'Enabler')!;
      const leaf = candidates.find((c) => c.feature.name === 'Leaf')!;
      expect(enabler.dependentsScore).toBeGreaterThan(leaf.dependentsScore);
    });
  });
});
```

2. Run test: `pnpm --filter @harness-engineering/core test -- --run tests/roadmap/pilot-scoring.test.ts`
3. Observe failure: module `pilot-scoring` does not exist
4. Create implementation `packages/core/src/roadmap/pilot-scoring.ts`:

```typescript
import type {
  Roadmap,
  RoadmapFeature,
  RoadmapMilestone,
  Priority,
  AssignmentRecord,
} from '@harness-engineering/types';

/**
 * A candidate feature with computed scores for the pilot selection algorithm.
 */
export interface ScoredCandidate {
  /** The original feature object */
  feature: RoadmapFeature;
  /** The milestone this feature belongs to */
  milestone: string;
  /** Position-based score (0-1): earlier in milestone + earlier milestone = higher */
  positionScore: number;
  /** Dependents-based score (0-1): more downstream blockers = higher */
  dependentsScore: number;
  /** Affinity-based score (0-1): bonus if user completed related items */
  affinityScore: number;
  /** Final weighted score (within tier) */
  weightedScore: number;
  /** Priority tier: 0 for P0, 1 for P1, etc. null for no priority */
  priorityTier: number | null;
}

export interface PilotScoringOptions {
  /** Current user identifier for affinity matching */
  currentUser?: string;
}

const PRIORITY_RANK: Record<Priority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const POSITION_WEIGHT = 0.5;
const DEPENDENTS_WEIGHT = 0.3;
const AFFINITY_WEIGHT = 0.2;

/**
 * Score and sort unblocked planned/backlog items using the two-tier algorithm.
 *
 * Tier 1: Items with explicit priority sorted by priority level (P0 > P1 > P2 > P3).
 * Tier 2: Items without priority sorted by weighted score.
 * Within the same priority tier, items are sorted by weighted score.
 *
 * Weights: position (0.5), dependents (0.3), affinity (0.2).
 */
export function scoreRoadmapCandidates(
  roadmap: Roadmap,
  options?: PilotScoringOptions
): ScoredCandidate[] {
  const allFeatures = roadmap.milestones.flatMap((m) => m.features);
  const doneFeatures = new Set(
    allFeatures.filter((f) => f.status === 'done').map((f) => f.name.toLowerCase())
  );

  // Build dependents map: feature name -> count of features that list it as a blocker
  const dependentsCount = new Map<string, number>();
  for (const feature of allFeatures) {
    for (const blocker of feature.blockedBy) {
      const key = blocker.toLowerCase();
      dependentsCount.set(key, (dependentsCount.get(key) ?? 0) + 1);
    }
  }
  const maxDependents = Math.max(1, ...dependentsCount.values());

  // Build milestone feature map for affinity
  const milestoneMap = new Map<string, string[]>();
  for (const ms of roadmap.milestones) {
    milestoneMap.set(
      ms.name,
      ms.features.map((f) => f.name.toLowerCase())
    );
  }

  // Build affinity data from assignment history
  const userCompletedFeatures = new Set<string>();
  if (options?.currentUser) {
    const user = options.currentUser.toLowerCase();
    for (const record of roadmap.assignmentHistory) {
      if (record.action === 'completed' && record.assignee.toLowerCase() === user) {
        userCompletedFeatures.add(record.feature.toLowerCase());
      }
    }
  }

  // Compute total positions for normalization
  let totalPositions = 0;
  for (const ms of roadmap.milestones) {
    totalPositions += ms.features.length;
  }
  totalPositions = Math.max(1, totalPositions);

  // Filter and score candidates
  const candidates: ScoredCandidate[] = [];
  let globalPosition = 0;

  for (const ms of roadmap.milestones) {
    for (let featureIdx = 0; featureIdx < ms.features.length; featureIdx++) {
      const feature = ms.features[featureIdx]!;
      globalPosition++;

      // Filter: only planned or backlog
      if (feature.status !== 'planned' && feature.status !== 'backlog') continue;

      // Filter: must be unblocked (all blockers done or unknown)
      const isBlocked = feature.blockedBy.some(
        (blocker) => !doneFeatures.has(blocker.toLowerCase())
      );
      if (isBlocked) continue;

      // Position score: earlier = higher (1.0 for first, approaching 0 for last)
      const positionScore = 1 - (globalPosition - 1) / totalPositions;

      // Dependents score: more downstream = higher
      const deps = dependentsCount.get(feature.name.toLowerCase()) ?? 0;
      const dependentsScore = deps / maxDependents;

      // Affinity score: bonus if user completed blockers or milestone siblings
      let affinityScore = 0;
      if (userCompletedFeatures.size > 0) {
        // Check if user completed any blockers of this feature
        const completedBlockers = feature.blockedBy.filter((b) =>
          userCompletedFeatures.has(b.toLowerCase())
        );
        if (completedBlockers.length > 0) {
          affinityScore = 1.0;
        } else {
          // Check milestone siblings
          const siblings = milestoneMap.get(ms.name) ?? [];
          const completedSiblings = siblings.filter((s) => userCompletedFeatures.has(s));
          if (completedSiblings.length > 0) {
            affinityScore = 0.5;
          }
        }
      }

      const weightedScore =
        POSITION_WEIGHT * positionScore +
        DEPENDENTS_WEIGHT * dependentsScore +
        AFFINITY_WEIGHT * affinityScore;

      const priorityTier = feature.priority ? PRIORITY_RANK[feature.priority] : null;

      candidates.push({
        feature,
        milestone: ms.name,
        positionScore,
        dependentsScore,
        affinityScore,
        weightedScore,
        priorityTier,
      });
    }
  }

  // Sort: priority tier first (lower = better, null = after all priorities), then weighted score desc
  candidates.sort((a, b) => {
    // Tier 1 vs Tier 2
    if (a.priorityTier !== null && b.priorityTier === null) return -1;
    if (a.priorityTier === null && b.priorityTier !== null) return 1;

    // Within same tier type
    if (a.priorityTier !== null && b.priorityTier !== null) {
      if (a.priorityTier !== b.priorityTier) return a.priorityTier - b.priorityTier;
    }

    // Within same priority tier (or both null): sort by weighted score desc
    return b.weightedScore - a.weightedScore;
  });

  return candidates;
}
```

5. Run test: `pnpm --filter @harness-engineering/core test -- --run tests/roadmap/pilot-scoring.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(roadmap-pilot): add scoring algorithm with two-tier sort`

### Task 2: Add affinity scoring tests (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/roadmap/pilot-scoring.test.ts`

1. Append affinity tests to `packages/core/tests/roadmap/pilot-scoring.test.ts` inside the outer `describe`:

```typescript
describe('affinity scoring', () => {
  it('gives bonus when user completed a blocker of the candidate', () => {
    const roadmap: Roadmap = {
      frontmatter: {
        project: 'test',
        version: 1,
        lastSynced: '2026-04-01T00:00:00Z',
        lastManualEdit: '2026-04-01T00:00:00Z',
      },
      milestones: [
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Foundation', status: 'done' }),
            makeFeature({ name: 'Extension', status: 'planned', blockedBy: ['Foundation'] }),
            makeFeature({ name: 'Unrelated', status: 'planned' }),
          ],
        },
      ],
      assignmentHistory: [
        { feature: 'Foundation', assignee: '@cwarner', action: 'completed', date: '2026-03-15' },
      ],
    };

    const candidates = scoreRoadmapCandidates(roadmap, { currentUser: '@cwarner' });
    const extension = candidates.find((c) => c.feature.name === 'Extension')!;
    const unrelated = candidates.find((c) => c.feature.name === 'Unrelated')!;
    expect(extension.affinityScore).toBe(1.0);
    expect(unrelated.affinityScore).toBe(0);
  });

  it('gives partial bonus for milestone siblings completed by user', () => {
    const roadmap: Roadmap = {
      frontmatter: {
        project: 'test',
        version: 1,
        lastSynced: '2026-04-01T00:00:00Z',
        lastManualEdit: '2026-04-01T00:00:00Z',
      },
      milestones: [
        {
          name: 'M1',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Sibling', status: 'done' }),
            makeFeature({ name: 'Candidate', status: 'planned' }),
          ],
        },
        {
          name: 'M2',
          isBacklog: false,
          features: [makeFeature({ name: 'OtherMS', status: 'planned' })],
        },
      ],
      assignmentHistory: [
        { feature: 'Sibling', assignee: '@cwarner', action: 'completed', date: '2026-03-15' },
      ],
    };

    const candidates = scoreRoadmapCandidates(roadmap, { currentUser: '@cwarner' });
    const candidate = candidates.find((c) => c.feature.name === 'Candidate')!;
    const otherMs = candidates.find((c) => c.feature.name === 'OtherMS')!;
    expect(candidate.affinityScore).toBe(0.5);
    expect(otherMs.affinityScore).toBe(0);
  });

  it('gives no affinity when no currentUser is provided', () => {
    const roadmap: Roadmap = {
      frontmatter: {
        project: 'test',
        version: 1,
        lastSynced: '2026-04-01T00:00:00Z',
        lastManualEdit: '2026-04-01T00:00:00Z',
      },
      milestones: [
        {
          name: 'M1',
          isBacklog: false,
          features: [makeFeature({ name: 'Feature', status: 'planned' })],
        },
      ],
      assignmentHistory: [
        { feature: 'Something', assignee: '@cwarner', action: 'completed', date: '2026-03-15' },
      ],
    };

    const candidates = scoreRoadmapCandidates(roadmap);
    expect(candidates[0]!.affinityScore).toBe(0);
  });
});
```

2. Run test: `pnpm --filter @harness-engineering/core test -- --run tests/roadmap/pilot-scoring.test.ts`
3. Observe: all tests pass (implementation already handles affinity from Task 1)
4. Run: `harness validate`
5. Commit: `test(roadmap-pilot): add affinity scoring test coverage`

### Task 3: Implement `assignFeature` with reassignment support (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/roadmap/pilot-scoring.test.ts`, `packages/core/src/roadmap/pilot-scoring.ts`

1. Add tests to `packages/core/tests/roadmap/pilot-scoring.test.ts`:

```typescript
import {
  scoreRoadmapCandidates,
  assignFeature,
  type ScoredCandidate,
  type PilotScoringOptions,
} from '../../src/roadmap/pilot-scoring';

// ... add to end of file:

describe('assignFeature()', () => {
  it('sets assignee and appends assigned record for unassigned feature', () => {
    const feature = makeFeature({ name: 'My Feature', assignee: null });
    const roadmap = makeRoadmap([{ name: 'M1', isBacklog: false, features: [feature] }]);

    assignFeature(roadmap, feature, '@cwarner', '2026-04-02');

    expect(feature.assignee).toBe('@cwarner');
    expect(roadmap.assignmentHistory).toHaveLength(1);
    expect(roadmap.assignmentHistory[0]).toEqual({
      feature: 'My Feature',
      assignee: '@cwarner',
      action: 'assigned',
      date: '2026-04-02',
    });
  });

  it('produces unassigned + assigned records on reassignment', () => {
    const feature = makeFeature({ name: 'My Feature', assignee: '@alice' });
    const roadmap = makeRoadmap([{ name: 'M1', isBacklog: false, features: [feature] }]);

    assignFeature(roadmap, feature, '@bob', '2026-04-02');

    expect(feature.assignee).toBe('@bob');
    expect(roadmap.assignmentHistory).toHaveLength(2);
    expect(roadmap.assignmentHistory[0]).toEqual({
      feature: 'My Feature',
      assignee: '@alice',
      action: 'unassigned',
      date: '2026-04-02',
    });
    expect(roadmap.assignmentHistory[1]).toEqual({
      feature: 'My Feature',
      assignee: '@bob',
      action: 'assigned',
      date: '2026-04-02',
    });
  });

  it('is a no-op when assigning to the current assignee', () => {
    const feature = makeFeature({ name: 'My Feature', assignee: '@cwarner' });
    const roadmap = makeRoadmap([{ name: 'M1', isBacklog: false, features: [feature] }]);

    assignFeature(roadmap, feature, '@cwarner', '2026-04-02');

    expect(feature.assignee).toBe('@cwarner');
    expect(roadmap.assignmentHistory).toHaveLength(0);
  });
});
```

2. Run test: `pnpm --filter @harness-engineering/core test -- --run tests/roadmap/pilot-scoring.test.ts`
3. Observe failure: `assignFeature` is not exported
4. Add to `packages/core/src/roadmap/pilot-scoring.ts`:

```typescript
/**
 * Assign a feature to a user, updating the feature's assignee field
 * and appending records to the assignment history.
 *
 * - New assignment: appends one 'assigned' record.
 * - Reassignment: appends 'unassigned' for previous + 'assigned' for new.
 * - Same assignee: no-op.
 *
 * Mutates roadmap in-place.
 */
export function assignFeature(
  roadmap: Roadmap,
  feature: RoadmapFeature,
  assignee: string,
  date: string
): void {
  if (feature.assignee === assignee) return;

  if (feature.assignee !== null) {
    roadmap.assignmentHistory.push({
      feature: feature.name,
      assignee: feature.assignee,
      action: 'unassigned',
      date,
    });
  }

  feature.assignee = assignee;
  roadmap.assignmentHistory.push({
    feature: feature.name,
    assignee,
    action: 'assigned',
    date,
  });
}
```

5. Run test: `pnpm --filter @harness-engineering/core test -- --run tests/roadmap/pilot-scoring.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(roadmap-pilot): add assignFeature with reassignment history`

### Task 4: Export pilot scoring from roadmap index

**Depends on:** Tasks 1, 3
**Files:** `packages/core/src/roadmap/index.ts`

1. Add exports to `packages/core/src/roadmap/index.ts`:

```typescript
/**
 * Pilot scoring algorithm for auto-pick feature selection.
 */
export { scoreRoadmapCandidates, assignFeature } from './pilot-scoring';
export type { ScoredCandidate, PilotScoringOptions } from './pilot-scoring';
```

2. Run: `pnpm --filter @harness-engineering/core test -- --run`
3. Observe: all existing tests still pass
4. Run: `harness validate`
5. Commit: `feat(roadmap-pilot): export scoring functions from roadmap index`

### Task 5: Create `skill.yaml` for the roadmap pilot skill

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-roadmap-pilot/skill.yaml`

1. Create `agents/skills/claude-code/harness-roadmap-pilot/skill.yaml`:

```yaml
name: harness-roadmap-pilot
version: '1.0.0'
description: AI-assisted selection of the next highest-impact roadmap item with scoring, assignment, and skill transition
cognitive_mode: constructive-architect
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - emit_interaction
cli:
  command: harness skill run harness-roadmap-pilot
  args:
    - name: path
      description: Project root path
      required: false
    - name: user
      description: 'Current user identifier (e.g., @cwarner) for affinity matching'
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-roadmap-pilot
    path: string
type: rigid
tier: 2
phases:
  - name: scan
    description: Parse roadmap, filter unblocked candidates, compute scores
    required: true
  - name: recommend
    description: AI reads top candidates specs and provides recommendation
    required: true
  - name: confirm
    description: Present recommendation to human for approval
    required: true
  - name: assign
    description: Update assignee, history, sync external, transition to next skill
    required: true
state:
  persistent: false
depends_on:
  - harness-brainstorming
  - harness-autopilot
  - harness-roadmap
```

2. Run: `harness validate`
3. Commit: `feat(roadmap-pilot): add skill.yaml`

### Task 6: Create SKILL.md for the roadmap pilot skill

**Depends on:** Task 5
**Files:** `agents/skills/claude-code/harness-roadmap-pilot/SKILL.md`

1. Create `agents/skills/claude-code/harness-roadmap-pilot/SKILL.md`:

```markdown
# Harness Roadmap Pilot

> AI-assisted selection of the next highest-impact unblocked roadmap item. Scores candidates, recommends one, assigns it, and transitions to the appropriate next skill.

## When to Use

- When the team or individual needs to pick the next item to work on from the roadmap
- When there are multiple unblocked items and prioritization guidance is needed
- After completing a feature and looking for the next highest-impact work
- NOT when the roadmap does not exist (direct user to harness-roadmap --create)
- NOT when the user already knows what to work on (use harness-brainstorming or harness-autopilot directly)

## Process

### Iron Law

**Never assign or transition without the human confirming the recommendation first.**

Present the ranked candidates, the AI reasoning, and the recommended pick. Wait for explicit confirmation before making any changes.

---

### Phase 1: SCAN -- Score Candidates

1. Check if `docs/roadmap.md` exists.
   - If missing: error. "No roadmap found at docs/roadmap.md. Run harness-roadmap --create first."
2. Parse the roadmap using `parseRoadmap` from `@harness-engineering/core`.
3. Determine the current user:
   - Use the `--user` argument if provided
   - Otherwise, attempt to detect from git config: `git config user.name` or `git config user.email`
   - If neither available, proceed without affinity scoring
4. Call `scoreRoadmapCandidates(roadmap, { currentUser })` from `@harness-engineering/core`.
5. If no candidates: inform the human. "No unblocked planned or backlog items found. All items are either in-progress, done, blocked, or the roadmap is empty."

Present the top 5 candidates:
```

ROADMAP PILOT -- Candidate Scoring

Top candidates (scored by position 50%, dependents 30%, affinity 20%):

# Feature Milestone Priority Score Breakdown

1. Feature A MVP Release P0 0.85 pos:0.9 dep:0.8 aff:1.0
2. Feature B MVP Release P1 0.72 pos:0.8 dep:0.6 aff:0.5
3. Feature C Q2 Release -- 0.65 pos:0.7 dep:0.5 aff:0.0
4. Feature D Backlog -- 0.40 pos:0.3 dep:0.4 aff:0.0
5. Feature E Backlog -- 0.35 pos:0.2 dep:0.3 aff:0.0

```

### Phase 2: RECOMMEND -- AI-Assisted Analysis

1. For the top 3 candidates, read their spec files (if they exist):
   - Read the spec's Overview and Goals section
   - Read the spec's Success Criteria section
   - Assess effort and impact from the spec content

2. Provide a recommendation with reasoning:

```

RECOMMENDATION

I recommend Feature A (MVP Release, P0, score: 0.85).

Reasoning:

- Highest priority (P0) with strong positional signal (first in MVP milestone)
- Unblocks 2 downstream features (Feature X, Feature Y)
- You completed its blocker "Foundation" -- high context affinity
- Spec exists with clear success criteria (12 acceptance tests)
- Estimated effort: medium (8 tasks in the plan)

Alternative: Feature B (P1, score: 0.72) -- consider if Feature A's scope is too large for the current time window.

Proceed with Feature A? (y/n/pick another)

````

### Phase 3: CONFIRM -- Human Decision

1. Wait for human confirmation.
   - If **yes**: proceed to Phase 4.
   - If **pick another**: ask which candidate number, then proceed with that pick.
   - If **no**: stop. No changes made.

### Phase 4: ASSIGN -- Execute Assignment and Transition

1. Call `assignFeature(roadmap, feature, currentUser, todayDate)` from `@harness-engineering/core`.
   - This updates the feature's `Assignee` field
   - Appends `assigned` record to assignment history (and `unassigned` for previous assignee if reassignment)

2. Serialize and write the updated roadmap to `docs/roadmap.md`.

3. If tracker config exists in `harness.config.json`, sync the assignment:
   - Call the external tracker's `assignTicket` to push the assignment
   - Log result but do not block on failure

4. Determine the transition target:
   - If the feature has a `spec` field (non-null): transition to `harness:autopilot`
   - If the feature has no `spec`: transition to `harness:brainstorming`

5. Present the transition to the human via `emit_interaction`:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "transition",
     transition: {
       completedPhase: "roadmap-pilot",
       suggestedNext: "<brainstorming|autopilot>",
       reason: "Feature '<name>' assigned and ready for <brainstorming|execution>",
       artifacts: ["docs/roadmap.md"],
       requiresConfirmation: true,
       summary: "Assigned '<name>' to <user>. <Spec exists -- ready for autopilot|No spec -- needs brainstorming first>.",
       qualityGate: {
         checks: [
           { "name": "roadmap-parsed", "passed": true },
           { "name": "candidate-scored", "passed": true },
           { "name": "human-confirmed", "passed": true },
           { "name": "assignment-written", "passed": true }
         ],
         allPassed: true
       }
     }
   })
````

6. Run `harness validate`.

---

## Harness Integration

- **`parseRoadmap` / `serializeRoadmap`** -- Parse and write `docs/roadmap.md`. Import from `@harness-engineering/core`.
- **`scoreRoadmapCandidates`** -- Core scoring algorithm. Import from `@harness-engineering/core`. Takes a `Roadmap` and optional `PilotScoringOptions` (currentUser for affinity).
- **`assignFeature`** -- Assignment with history tracking. Import from `@harness-engineering/core`. Handles new assignment and reassignment (unassigned + assigned records).
- **`emit_interaction`** -- Used for the skill transition at the end. Transitions to `harness:brainstorming` (no spec) or `harness:autopilot` (spec exists).
- **`harness validate`** -- Run after assignment is written.
- **External sync** -- If `harness.config.json` has tracker config, use `fullSync` or direct `assignTicket` to push assignment to external service.

## Success Criteria

1. Roadmap is parsed and unblocked planned/backlog items are scored
2. Scoring uses two-tier sort: explicit priority first, then weighted score
3. AI reads top candidates' specs and provides recommendation with reasoning
4. Human confirms before any changes are made
5. Assignment updates feature field, appends history records, and syncs externally
6. Reassignment produces two history records (unassigned + assigned)
7. Transition routes to brainstorming (no spec) or autopilot (spec exists)
8. `harness validate` passes after all changes

## Examples

### Example: Pick Next Item from a Multi-Milestone Roadmap

**Context:** A roadmap with 3 milestones, 8 features. 2 are in-progress, 1 is done, 2 are blocked, 3 are planned/backlog and unblocked. User is @cwarner who completed "Core Library Design".

**Phase 1: SCAN**

```
ROADMAP PILOT -- Candidate Scoring

Top candidates:
  #  Feature               Milestone    Priority  Score   Breakdown
  1. Graph Connector       MVP Release  P2        0.78    pos:0.8 dep:0.6 aff:1.0
  2. Performance Baselines Q3 Hardening --        0.45    pos:0.5 dep:0.3 aff:0.0
  3. Push Notifications    Backlog      --        0.30    pos:0.2 dep:0.2 aff:0.5
```

**Phase 2: RECOMMEND**

```
I recommend Graph Connector (MVP Release, P2, score: 0.78).

Reasoning:
- Only prioritized item among candidates (P2)
- You completed its blocker "Core Library Design" -- maximum affinity bonus
- Unblocks "API Integration" downstream
- Spec exists at docs/changes/graph-connector/proposal.md

Proceed? (y/n/pick another)
```

Human confirms **y**.

**Phase 4: ASSIGN**

```
Assigned: Graph Connector -> @cwarner
History: +1 record (assigned, 2026-04-02)
Roadmap updated: docs/roadmap.md
External sync: github:harness-eng/harness#43 assigned

Transitioning to harness:autopilot (spec exists)...
```

## Gates

- **No assignment without human confirmation.** The CONFIRM phase must complete with explicit approval. Never auto-assign.
- **No transition without assignment.** The skill must write the assignment before transitioning to the next skill.
- **No scoring without a parsed roadmap.** If `docs/roadmap.md` does not exist or fails to parse, stop with an error.

## Escalation

- **When no unblocked candidates exist:** Inform the human. Suggest reviewing blocked items to see if blockers can be resolved, or adding new features via `harness-roadmap --add`.
- **When affinity data is unavailable:** Proceed without affinity scoring (weight falls to 0 for all candidates). Note this in the output.
- **When external sync fails:** Log the error, complete the local assignment, and note that external sync can be retried with `harness-roadmap --sync`.

````

2. Run: `harness validate`
3. Commit: `feat(roadmap-pilot): add SKILL.md with full process and examples`

### Task 7: Integration test -- full pick-assign-transition flow

**Depends on:** Tasks 1-4
**Files:** `packages/core/tests/roadmap/pilot-scoring.test.ts`

1. Add integration test to `packages/core/tests/roadmap/pilot-scoring.test.ts`:

```typescript
describe('integration: pick -> assign -> transition decision', () => {
  it('full flow: score, pick top, assign, determine transition target', () => {
    const roadmap: Roadmap = {
      frontmatter: {
        project: 'test',
        version: 1,
        lastSynced: '2026-04-01T00:00:00Z',
        lastManualEdit: '2026-04-01T00:00:00Z',
      },
      milestones: [
        {
          name: 'MVP',
          isBacklog: false,
          features: [
            makeFeature({ name: 'Foundation', status: 'done' }),
            makeFeature({
              name: 'WithSpec',
              status: 'planned',
              priority: 'P1',
              spec: 'docs/changes/with-spec/proposal.md',
              blockedBy: ['Foundation'],
            }),
            makeFeature({
              name: 'NoSpec',
              status: 'planned',
              priority: 'P2',
              spec: null,
            }),
          ],
        },
      ],
      assignmentHistory: [
        { feature: 'Foundation', assignee: '@cwarner', action: 'completed', date: '2026-03-15' },
      ],
    };

    // Step 1: Score candidates
    const candidates = scoreRoadmapCandidates(roadmap, { currentUser: '@cwarner' });
    expect(candidates.length).toBe(2);

    // Step 2: Top pick should be WithSpec (P1 > P2, plus affinity for completed blocker)
    const topPick = candidates[0]!;
    expect(topPick.feature.name).toBe('WithSpec');
    expect(topPick.affinityScore).toBe(1.0); // completed blocker

    // Step 3: Assign
    assignFeature(roadmap, topPick.feature, '@cwarner', '2026-04-02');
    expect(topPick.feature.assignee).toBe('@cwarner');
    expect(roadmap.assignmentHistory).toHaveLength(2); // original completed + new assigned

    // Step 4: Determine transition target
    const transitionTarget = topPick.feature.spec ? 'harness:autopilot' : 'harness:brainstorming';
    expect(transitionTarget).toBe('harness:autopilot');
  });

  it('routes to brainstorming when feature has no spec', () => {
    const roadmap: Roadmap = {
      frontmatter: {
        project: 'test',
        version: 1,
        lastSynced: '2026-04-01T00:00:00Z',
        lastManualEdit: '2026-04-01T00:00:00Z',
      },
      milestones: [
        {
          name: 'Backlog',
          isBacklog: true,
          features: [
            makeFeature({ name: 'NoSpec', status: 'backlog', spec: null }),
          ],
        },
      ],
      assignmentHistory: [],
    };

    const candidates = scoreRoadmapCandidates(roadmap);
    expect(candidates).toHaveLength(1);

    assignFeature(roadmap, candidates[0]!.feature, '@user', '2026-04-02');

    const target = candidates[0]!.feature.spec ? 'harness:autopilot' : 'harness:brainstorming';
    expect(target).toBe('harness:brainstorming');
  });
});
````

2. Run test: `pnpm --filter @harness-engineering/core test -- --run tests/roadmap/pilot-scoring.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(roadmap-pilot): add integration test for pick-assign-transition flow`

### Task 8: Verify all existing tests pass and run final validation

**Depends on:** Tasks 1-7
**Files:** none (verification only)

[checkpoint:human-verify] -- Verify the complete implementation before final sign-off.

1. Run all core tests: `pnpm --filter @harness-engineering/core test -- --run`
2. Observe: all tests pass (existing + new)
3. Run: `harness validate`
4. Run: `harness check-deps`
5. Verify skill directory exists: `ls agents/skills/claude-code/harness-roadmap-pilot/`
6. Report results to human.
