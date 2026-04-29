import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gatherRoadmap } from '../../../src/server/gather/roadmap';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');

const VALID_ROADMAP = `---
project: test-project
version: 1
last_synced: "2026-01-01T00:00:00Z"
last_manual_edit: "2026-01-01T00:00:00Z"
---

# Project Roadmap

## Milestone: MVP

### Feature: Auth
- **Status:** done
- **Summary:** Authentication system
- **Spec:** docs/auth.md

### Feature: Dashboard
- **Status:** in-progress
- **Summary:** Project dashboard
- **Spec:** docs/dashboard.md

### Feature: API
- **Status:** planned
- **Summary:** REST API
- **Spec:** docs/api.md

## Milestone: V2

### Feature: SSO
- **Status:** blocked
- **Summary:** Single sign-on
- **Blocked by:** Auth
- **Spec:** docs/sso.md

### Feature: Reports
- **Status:** backlog
- **Summary:** Reporting system
`;

describe('gatherRoadmap', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns structured roadmap data for valid file', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(VALID_ROADMAP);
    const result = await gatherRoadmap('/project/docs/roadmap.md');

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.totalFeatures).toBe(5);
    expect(result.totalDone).toBe(1);
    expect(result.totalInProgress).toBe(1);
    expect(result.totalPlanned).toBe(1);
    expect(result.totalBlocked).toBe(1);
    expect(result.totalBacklog).toBe(1);
    expect(result.assignmentHistory).toEqual([]);
    expect(result.milestones).toHaveLength(2);
    expect(result.milestones[0]!.name).toBe('MVP');
    expect(result.milestones[0]!.total).toBe(3);
    expect(result.milestones[0]!.done).toBe(1);
  });

  it('returns error for nonexistent file', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    const result = await gatherRoadmap('/project/docs/roadmap.md');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('ENOENT');
  });

  it('returns error for malformed roadmap', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('not a valid roadmap');
    const result = await gatherRoadmap('/project/docs/roadmap.md');

    expect('error' in result).toBe(true);
  });

  it('returns projected features without filesystem paths', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(VALID_ROADMAP);
    const result = await gatherRoadmap('/project/docs/roadmap.md');

    if ('error' in result) return;
    expect(result.features).toHaveLength(5);

    const auth = result.features[0]!;
    expect(auth.name).toBe('Auth');
    expect(auth.status).toBe('done');
    expect(auth.summary).toBe('Authentication system');
    expect(auth.milestone).toBe('MVP');
    // Spec and plans are now passed through for workflow routing
    expect(auth.spec).toBe('docs/auth.md');
    expect(auth.plans).toEqual([]);
    expect(auth.externalId).toBeNull();
    expect(auth.updatedAt).toBeNull();
  });
});
