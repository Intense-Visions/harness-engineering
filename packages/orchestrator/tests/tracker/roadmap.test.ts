import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
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

vi.mock('node:fs/promises');

describe('RoadmapTrackerAdapter', () => {
  const mockConfig: TrackerConfig = {
    kind: 'roadmap',
    filePath: 'ROADMAP.md',
    activeStates: ['planned', 'in-progress'],
    terminalStates: ['done'],
  };

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

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fetches candidate issues based on active states', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockRoadmapContent);
    const adapter = new RoadmapTrackerAdapter(mockConfig);
    const result = await adapter.fetchCandidateIssues();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0].title).toBe('Task 1');
      expect(result.value[1].title).toBe('Task 2');
    }
  });

  it('fetches issues by specific states', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockRoadmapContent);
    const adapter = new RoadmapTrackerAdapter(mockConfig);
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
    vi.mocked(fs.readFile).mockResolvedValue(roadmapWithNeedsHuman);
    const adapter = new RoadmapTrackerAdapter({
      ...mockConfig,
      activeStates: ['planned', 'needs-human'],
    });
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
    vi.mocked(fs.readFile).mockResolvedValue(mockRoadmapContent);
    const adapter = new RoadmapTrackerAdapter(mockConfig);

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
    // end-to-end (parseRoadmap -> set status -> serializeRoadmap).
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
      vi.mocked(fs.readFile).mockResolvedValue(writableRoadmap);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const adapter = new RoadmapTrackerAdapter(mockConfig);
      const result = await adapter.markIssueComplete(idFor('Task 1'));

      expect(result.ok).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
      // Task 1's status line flipped to the first configured terminal state.
      expect(written).toMatch(/### Task 1\n\n- \*\*Status:\*\* done/);
    });

    it('is a no-op when the feature is already terminal', async () => {
      const alreadyDone = writableRoadmap.replace('**Status:** in-progress', '**Status:** done');
      vi.mocked(fs.readFile).mockResolvedValue(alreadyDone);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const adapter = new RoadmapTrackerAdapter(mockConfig);
      const result = await adapter.markIssueComplete(idFor('Task 1'));

      expect(result.ok).toBe(true);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('is a no-op when the feature is not found (removed between dispatch and completion)', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(writableRoadmap);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const adapter = new RoadmapTrackerAdapter(mockConfig);
      const result = await adapter.markIssueComplete(idFor('Deleted Feature'));

      expect(result.ok).toBe(true);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('returns Err when terminalStates is empty', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(writableRoadmap);
      const adapter = new RoadmapTrackerAdapter({ ...mockConfig, terminalStates: [] });
      const result = await adapter.markIssueComplete(idFor('Task 1'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/terminalStates/);
      }
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
      vi.mocked(fs.readFile).mockResolvedValue(writableRoadmap);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const adapter = new RoadmapTrackerAdapter(mockConfig);
      const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

      expect(result.ok).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
      expect(written).toMatch(/### Task 1\n\n- \*\*Status:\*\* in-progress/);
      expect(written).toContain('**Assignee:** orch-abc123');
    });

    it('is idempotent when already claimed by the same orchestrator', async () => {
      const alreadyClaimed = writableRoadmap
        .replace('**Status:** planned', '**Status:** in-progress')
        .replace('- **Plan:** —', '- **Plan:** —\n- **Assignee:** orch-abc123');
      vi.mocked(fs.readFile).mockResolvedValue(alreadyClaimed);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const adapter = new RoadmapTrackerAdapter(mockConfig);
      const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

      expect(result.ok).toBe(true);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('overwrites claim when a different orchestrator claims', async () => {
      const claimedByOther = writableRoadmap
        .replace('**Status:** planned', '**Status:** in-progress')
        .replace('- **Plan:** —', '- **Plan:** —\n- **Assignee:** orch-other');
      vi.mocked(fs.readFile).mockResolvedValue(claimedByOther);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const adapter = new RoadmapTrackerAdapter(mockConfig);
      const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

      expect(result.ok).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
      expect(written).toContain('**Assignee:** orch-abc123');
    });

    it('is a no-op when the feature is not found', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(writableRoadmap);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const adapter = new RoadmapTrackerAdapter(mockConfig);
      const result = await adapter.claimIssue(idFor('Nonexistent'), 'orch-abc123');

      expect(result.ok).toBe(true);
      expect(fs.writeFile).not.toHaveBeenCalled();
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
      vi.mocked(fs.readFile).mockResolvedValue(claimedRoadmap);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const adapter = new RoadmapTrackerAdapter(mockConfig);
      const result = await adapter.releaseIssue(idFor('Task 1'));

      expect(result.ok).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
      expect(written).toMatch(/### Task 1\n\n- \*\*Status:\*\* planned/);
      // Assignee cleared to null; with Priority and External-ID also null,
      // the serializer omits the entire extended-fields group.
      expect(written).not.toContain('**Assignee:**');
    });

    it('is a no-op when the feature is not found', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(claimedRoadmap);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const adapter = new RoadmapTrackerAdapter(mockConfig);
      const result = await adapter.releaseIssue(idFor('Nonexistent'));

      expect(result.ok).toBe(true);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('returns Err when activeStates is empty', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(claimedRoadmap);
      const adapter = new RoadmapTrackerAdapter({ ...mockConfig, activeStates: [] });
      const result = await adapter.releaseIssue(idFor('Task 1'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/activeStates/);
      }
    });
  });
});
