import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { RoadmapTrackerAdapter } from '../../src/tracker/adapters/roadmap';
import { TrackerConfig } from '@harness-engineering/types';

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
});
