import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { RoadmapTrackerAdapter } from '../../src/tracker/adapters/roadmap';
import { TrackerConfig } from '@harness-engineering/types';

/** Mirrors RoadmapTrackerAdapter.generateId so tests can match issue ids without importing it. */
function idFor(name: string): string {
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 8);
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 20);
  return `${sanitized}-${hash}`;
}

/**
 * The adapter reads + writes roadmap CONTENT through the store
 * (`resolveRoadmapStoreForFile` → `applyRoadmapDiff`), so these tests drive a REAL
 * monolith roadmap file under a temp dir rather than `node:fs` mocks. The
 * configured `filePath` points at the file; with no sibling `roadmap.d/` the store
 * resolves a monolith backend over it. Assertions read the file back after the
 * call rather than inspecting a write spy, since `applyRoadmapDiff` may issue more
 * than one underlying write (row + assignment-history) in monolith mode.
 */
describe('RoadmapTrackerAdapter', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'orch-roadmap-adapter-'));
    filePath = path.join(tmpDir, 'roadmap.md');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeConfig(overrides: Partial<TrackerConfig> = {}): TrackerConfig {
    return {
      kind: 'roadmap',
      filePath,
      activeStates: ['planned', 'in-progress'],
      terminalStates: ['done'],
      ...overrides,
    };
  }

  async function seed(content: string): Promise<void> {
    await writeFile(filePath, content, 'utf-8');
  }

  function readBack(): Promise<string> {
    return readFile(filePath, 'utf-8');
  }

  const mockRoadmapContent = `---
project: Test Project
version: 1
last_synced: '2026-03-24T00:00:00.000Z'
last_manual_edit: '2026-03-24T00:00:00.000Z'
---

## Milestone: MVP
### Feature: Task 1
- **Status:** planned
- **Summary:** First task
- **Blocked by:** none

### Feature: Task 2
- **Status:** in-progress
- **Summary:** Second task
- **Blocked by:** none

### Feature: Task 3
- **Status:** done
- **Summary:** Third task
- **Blocked by:** none
`;

  it('fetches candidate issues based on active states', async () => {
    await seed(mockRoadmapContent);
    const adapter = new RoadmapTrackerAdapter(makeConfig());
    const result = await adapter.fetchCandidateIssues();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0].title).toBe('Task 1');
      expect(result.value[1].title).toBe('Task 2');
    }
  });

  it('fetches issues by specific states', async () => {
    await seed(mockRoadmapContent);
    const adapter = new RoadmapTrackerAdapter(makeConfig());
    const result = await adapter.fetchIssuesByStates(['done']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe('Task 3');
    }
  });

  it('should include needs-human status issues when fetched by state', async () => {
    const roadmapWithNeedsHuman = `---
project: Test Project
version: 1
last_synced: '2026-03-24T00:00:00.000Z'
last_manual_edit: '2026-03-24T00:00:00.000Z'
---

## Milestone: MVP
### Feature: Task 1
- **Status:** planned
- **Summary:** First task
- **Blocked by:** none

### Feature: Task 2
- **Status:** needs-human
- **Summary:** Needs human review
- **Blocked by:** none
`;
    await seed(roadmapWithNeedsHuman);
    const adapter = new RoadmapTrackerAdapter(
      makeConfig({ activeStates: ['planned', 'needs-human'] })
    );
    const result = await adapter.fetchCandidateIssues();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      const needsHuman = result.value.find((i) => i.title === 'Task 2');
      expect(needsHuman).toBeDefined();
      expect(needsHuman?.state).toBe('needs-human');
    }
  });

  it('fetches issue states by ids', async () => {
    await seed(mockRoadmapContent);
    const adapter = new RoadmapTrackerAdapter(makeConfig());

    // Get real IDs first
    const candidates = await adapter.fetchCandidateIssues();
    if (!candidates.ok) throw candidates.error;
    const id1 = candidates.value[0].id;

    const done = await adapter.fetchIssuesByStates(['done']);
    if (!done.ok) throw done.error;
    const id3 = done.value[0].id;

    const result = await adapter.fetchIssueStatesByIds([id1, id3]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(2);
      expect(result.value.get(id1)?.title).toBe('Task 1');
      expect(result.value.get(id3)?.title).toBe('Task 3');
    }
  });

  describe('markIssueComplete', () => {
    // Uses the serializer's canonical markdown shape so round-tripping works
    // end-to-end (load -> set status -> applyRoadmapDiff).
    const writableRoadmap = `---
project: Test Project
version: 1
last_synced: '2026-03-24T00:00:00.000Z'
last_manual_edit: '2026-03-24T00:00:00.000Z'
---

# Roadmap

## MVP

### Task 1

- **Status:** in-progress
- **Spec:** —
- **Summary:** First task
- **Blockers:** —
- **Plan:** —
`;

    it('transitions matching feature to the first terminal state and writes back', async () => {
      await seed(writableRoadmap);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.markIssueComplete(idFor('Task 1'));

      expect(result.ok).toBe(true);
      const written = await readBack();
      // Task 1's status line flipped to the first configured terminal state.
      expect(written).toMatch(/### Task 1\n\n- \*\*Status:\*\* done/);
    });

    it('is a no-op when the feature is already terminal', async () => {
      const alreadyDone = writableRoadmap.replace('**Status:** in-progress', '**Status:** done');
      await seed(alreadyDone);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.markIssueComplete(idFor('Task 1'));

      expect(result.ok).toBe(true);
      expect(await readBack()).toBe(alreadyDone);
    });

    it('is a no-op when the feature is not found (removed between dispatch and completion)', async () => {
      await seed(writableRoadmap);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.markIssueComplete(idFor('Deleted Feature'));

      expect(result.ok).toBe(true);
      expect(await readBack()).toBe(writableRoadmap);
    });

    it('returns Err when terminalStates is empty', async () => {
      await seed(writableRoadmap);
      const adapter = new RoadmapTrackerAdapter(makeConfig({ terminalStates: [] }));
      const result = await adapter.markIssueComplete(idFor('Task 1'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/terminalStates/);
      }
    });

    it('clears the orchestrator assignee when marking complete (RMH005 invariant)', async () => {
      // The completed row must NOT carry a stale machine claim — a `done` row
      // with `assignee = orchestrator-*` is exactly the RMH005 violation the
      // assignee-execution-lifecycle feature forbids.
      const inProgressClaimed = writableRoadmap.replace(
        '- **Plan:** —',
        '- **Plan:** —\n- **Assignee:** orchestrator-5c895000'
      );
      await seed(inProgressClaimed);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.markIssueComplete(idFor('Task 1'));

      expect(result.ok).toBe(true);
      const written = await readBack();
      expect(written).toMatch(/### Task 1\n\n- \*\*Status:\*\* done/);
      // setStatus auto-cleared the assignee on the move away from in-progress.
      expect(written).not.toContain('**Assignee:** orchestrator-5c895000');
      // The release is recorded as an `unassigned` history entry.
      expect(written).toContain('| Task 1 | orchestrator-5c895000 | unassigned |');
    });

    it('leaves no assignee after a full claim → complete round-trip', async () => {
      // Round-trip through the real adapter methods so the fix is exercised
      // end-to-end: claim writes orchestrator-* assignee, complete clears it.
      const planned = writableRoadmap.replace('**Status:** in-progress', '**Status:** planned');
      await seed(planned);
      const adapter = new RoadmapTrackerAdapter(makeConfig());

      // 1. Claim: planned -> in-progress + assignee.
      const claimResult = await adapter.claimIssue(idFor('Task 1'), 'orchestrator-5c895000');
      expect(claimResult.ok).toBe(true);
      const claimed = await readBack();
      expect(claimed).toContain('**Assignee:** orchestrator-5c895000');

      // 2. Complete: same file; expect no assignee.
      const completeResult = await adapter.markIssueComplete(idFor('Task 1'));
      expect(completeResult.ok).toBe(true);
      const completed = await readBack();
      expect(completed).toMatch(/### Task 1\n\n- \*\*Status:\*\* done/);
      expect(completed).not.toContain('**Assignee:** orchestrator-5c895000');
      expect(completed).toContain('| Task 1 | orchestrator-5c895000 | unassigned |');
    });
  });

  describe('claimIssue', () => {
    const writableRoadmap = `---
project: Test Project
version: 1
last_synced: '2026-03-24T00:00:00.000Z'
last_manual_edit: '2026-03-24T00:00:00.000Z'
---

# Roadmap

## MVP

### Task 1

- **Status:** planned
- **Spec:** —
- **Summary:** First task
- **Blockers:** —
- **Plan:** —
`;

    it('transitions feature to in-progress and writes orchestratorId as assignee', async () => {
      await seed(writableRoadmap);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

      expect(result.ok).toBe(true);
      const written = await readBack();
      expect(written).toMatch(/### Task 1\n\n- \*\*Status:\*\* in-progress/);
      expect(written).toContain('**Assignee:** orch-abc123');
    });

    it('is idempotent when already claimed by the same orchestrator', async () => {
      const alreadyClaimed = writableRoadmap
        .replace('**Status:** planned', '**Status:** in-progress')
        .replace('- **Plan:** —', '- **Plan:** —\n- **Assignee:** orch-abc123');
      await seed(alreadyClaimed);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

      expect(result.ok).toBe(true);
      expect(await readBack()).toBe(alreadyClaimed);
    });

    it('does not overwrite when another orchestrator currently holds the claim', async () => {
      // Compare-and-set: skip the write when the on-disk assignee is a
      // third party. ClaimManager.claimAndVerify then reads back the
      // unchanged file and returns 'rejected'.
      const claimedByOther = writableRoadmap
        .replace('**Status:** planned', '**Status:** in-progress')
        .replace('- **Plan:** —', '- **Plan:** —\n- **Assignee:** orch-other');
      await seed(claimedByOther);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

      expect(result.ok).toBe(true);
      expect(await readBack()).toBe(claimedByOther);
    });

    it('does not overwrite when a human currently holds the assignment', async () => {
      const claimedByHuman = writableRoadmap.replace(
        '- **Plan:** —',
        '- **Plan:** —\n- **Assignee:** @alice'
      );
      await seed(claimedByHuman);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

      expect(result.ok).toBe(true);
      expect(await readBack()).toBe(claimedByHuman);
    });

    it('is a no-op when the feature is not found', async () => {
      await seed(writableRoadmap);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.claimIssue(idFor('Nonexistent'), 'orch-abc123');

      expect(result.ok).toBe(true);
      expect(await readBack()).toBe(writableRoadmap);
    });
  });

  describe('releaseIssue', () => {
    const claimedRoadmap = `---
project: Test Project
version: 1
last_synced: '2026-03-24T00:00:00.000Z'
last_manual_edit: '2026-03-24T00:00:00.000Z'
---

# Roadmap

## MVP

### Task 1

- **Status:** in-progress
- **Spec:** —
- **Summary:** First task
- **Blockers:** —
- **Plan:** —
- **Assignee:** orch-abc123
- **Priority:** —
- **External-ID:** —
`;

    it('transitions feature back to first active state and clears assignee', async () => {
      await seed(claimedRoadmap);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.releaseIssue(idFor('Task 1'));

      expect(result.ok).toBe(true);
      const written = await readBack();
      expect(written).toMatch(/### Task 1\n\n- \*\*Status:\*\* planned/);
      // Assignee cleared to null; with Priority and External-ID also null,
      // the serializer omits the entire extended-fields group.
      expect(written).not.toContain('**Assignee:**');
      // Release is routed through the lifecycle authority, so it logs an
      // `unassigned` history record (audit symmetry with claim/complete).
      expect(written).toContain('| Task 1 | orch-abc123 | unassigned |');
    });

    it('is a no-op when the feature is not found', async () => {
      await seed(claimedRoadmap);
      const adapter = new RoadmapTrackerAdapter(makeConfig());
      const result = await adapter.releaseIssue(idFor('Nonexistent'));

      expect(result.ok).toBe(true);
      expect(await readBack()).toBe(claimedRoadmap);
    });

    it('returns Err when activeStates is empty', async () => {
      await seed(claimedRoadmap);
      const adapter = new RoadmapTrackerAdapter(makeConfig({ activeStates: [] }));
      const result = await adapter.releaseIssue(idFor('Task 1'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/activeStates/);
      }
    });
  });
});
