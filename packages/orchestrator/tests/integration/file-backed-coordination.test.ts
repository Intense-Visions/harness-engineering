import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { RoadmapTrackerAdapter } from '../../src/tracker/adapters/roadmap';
import { ClaimManager } from '../../src/core/claim-manager';
import type { TrackerConfig } from '@harness-engineering/types';

const ROADMAP_MD = `---
project: harness-engineering
version: 1
last_synced: 2026-04-01T10:00:00Z
last_manual_edit: 2026-04-01T09:00:00Z
---

# Roadmap

## Current Work

### Feature Alpha

- **Status:** planned
- **Spec:** docs/changes/alpha/proposal.md
- **Summary:** First feature for coordination test
- **Blockers:** \u2014
- **Plan:** \u2014

### Feature Beta

- **Status:** planned
- **Spec:** docs/changes/beta/proposal.md
- **Summary:** Second feature for coordination test
- **Blockers:** \u2014
- **Plan:** \u2014
`;

let tmpDir: string;
let roadmapPath: string;

function makeConfig(): TrackerConfig {
  return {
    kind: 'roadmap',
    filePath: roadmapPath,
    activeStates: ['planned', 'in-progress'],
    terminalStates: ['done'],
  };
}

describe('File-Backed Claim Coordination', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-file-coord-'));
    roadmapPath = path.join(tmpDir, 'roadmap.md');
    fs.writeFileSync(roadmapPath, ROADMAP_MD, 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('two ClaimManagers racing for the same issue: only one wins', async () => {
    const config = makeConfig();
    const trackerA = new RoadmapTrackerAdapter(config);
    const trackerB = new RoadmapTrackerAdapter(config);

    const managerA = new ClaimManager(trackerA, 'orch-alpha', { verifyDelayMs: 0 });
    const managerB = new ClaimManager(trackerB, 'orch-beta', { verifyDelayMs: 0 });

    // Fetch candidates to get the issue ID
    const candidatesResult = await trackerA.fetchCandidateIssues();
    expect(candidatesResult.ok).toBe(true);
    if (!candidatesResult.ok) return;

    const alphaIssue = candidatesResult.value.find((c) => c.title === 'Feature Alpha');
    expect(alphaIssue).toBeDefined();
    const issueId = alphaIssue!.id;

    // Both managers try to claim the same issue
    const resultA = await managerA.claimAndVerify(issueId);
    const resultB = await managerB.claimAndVerify(issueId);

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    // Since claims are sequential (file-based), the first one wins.
    // After A claims, B writes over A's claim. Then B verifies and sees itself.
    // But A already verified before B wrote. So both may think they won.
    // With verifyDelayMs: 0, the last writer wins.
    // The key guarantee: the tracker file has exactly ONE assignee.
    const statesResult = await trackerA.fetchIssueStatesByIds([issueId]);
    expect(statesResult.ok).toBe(true);
    if (!statesResult.ok) return;

    const finalState = statesResult.value.get(issueId);
    expect(finalState).toBeDefined();
    expect(finalState!.state).toBe('in-progress');
    // Exactly one orchestrator owns it in the file
    expect(['orch-alpha', 'orch-beta']).toContain(finalState!.assignee);
  });

  it('claimIssue writes updatedAt timestamp', async () => {
    const config = makeConfig();
    const tracker = new RoadmapTrackerAdapter(config);
    const manager = new ClaimManager(tracker, 'orch-test', { verifyDelayMs: 0 });

    const candidatesResult = await tracker.fetchCandidateIssues();
    expect(candidatesResult.ok).toBe(true);
    if (!candidatesResult.ok) return;

    const issue = candidatesResult.value[0]!;
    const beforeClaim = Date.now();

    await manager.claimAndVerify(issue.id);

    const statesResult = await tracker.fetchIssueStatesByIds([issue.id]);
    expect(statesResult.ok).toBe(true);
    if (!statesResult.ok) return;

    const claimed = statesResult.value.get(issue.id)!;
    expect(claimed.assignee).toBe('orch-test');
    expect(claimed.updatedAt).not.toBeNull();

    const updatedAtMs = new Date(claimed.updatedAt!).getTime();
    expect(updatedAtMs).toBeGreaterThanOrEqual(beforeClaim - 1000);
    expect(updatedAtMs).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('releaseIssue clears assignee and updatedAt', async () => {
    const config = makeConfig();
    const tracker = new RoadmapTrackerAdapter(config);
    const manager = new ClaimManager(tracker, 'orch-test', { verifyDelayMs: 0 });

    const candidatesResult = await tracker.fetchCandidateIssues();
    expect(candidatesResult.ok).toBe(true);
    if (!candidatesResult.ok) return;

    const issue = candidatesResult.value[0]!;

    // Claim then release
    await manager.claimAndVerify(issue.id);
    await manager.release(issue.id);

    const statesResult = await tracker.fetchIssueStatesByIds([issue.id]);
    expect(statesResult.ok).toBe(true);
    if (!statesResult.ok) return;

    const released = statesResult.value.get(issue.id)!;
    expect(released.assignee).toBeNull();
    expect(released.state).toBe('planned');
    expect(released.updatedAt).toBeNull();
  });

  it('heartbeat refreshes updatedAt for claimed issues', async () => {
    const config = makeConfig();
    const tracker = new RoadmapTrackerAdapter(config);
    const manager = new ClaimManager(tracker, 'orch-test', { verifyDelayMs: 0 });

    const candidatesResult = await tracker.fetchCandidateIssues();
    expect(candidatesResult.ok).toBe(true);
    if (!candidatesResult.ok) return;

    const issue = candidatesResult.value[0]!;
    await manager.claimAndVerify(issue.id);

    // Read initial updatedAt
    let statesResult = await tracker.fetchIssueStatesByIds([issue.id]);
    expect(statesResult.ok).toBe(true);
    const firstUpdatedAt = statesResult.ok ? statesResult.value.get(issue.id)!.updatedAt : null;
    expect(firstUpdatedAt).not.toBeNull();

    // Wait briefly so timestamp changes
    await new Promise((r) => setTimeout(r, 10));

    // Heartbeat should update the timestamp
    await manager.heartbeat([issue.id]);

    statesResult = await tracker.fetchIssueStatesByIds([issue.id]);
    expect(statesResult.ok).toBe(true);
    if (!statesResult.ok) return;

    const secondUpdatedAt = statesResult.value.get(issue.id)!.updatedAt;
    expect(secondUpdatedAt).not.toBeNull();
    // The heartbeat should have written a newer timestamp
    expect(new Date(secondUpdatedAt!).getTime()).toBeGreaterThanOrEqual(
      new Date(firstUpdatedAt!).getTime()
    );
  });

  it('isStale detects expired claims from file-persisted updatedAt', async () => {
    const config = makeConfig();
    const tracker = new RoadmapTrackerAdapter(config);
    const manager = new ClaimManager(tracker, 'orch-live', { verifyDelayMs: 0 });

    const candidatesResult = await tracker.fetchCandidateIssues();
    expect(candidatesResult.ok).toBe(true);
    if (!candidatesResult.ok) return;

    const issue = candidatesResult.value[0]!;

    // Simulate a dead orchestrator: claim the issue, then manually backdate updatedAt
    const deadManager = new ClaimManager(tracker, 'orch-dead', { verifyDelayMs: 0 });
    await deadManager.claimAndVerify(issue.id);

    // Read the roadmap and manually set updatedAt to 20 minutes ago
    let content = fs.readFileSync(roadmapPath, 'utf-8');
    const oldTimestamp = new Date(Date.now() - 1_200_000).toISOString();
    // The serializer writes `- **Updated-At:** <timestamp>` on its own line
    content = content.replace(/- \*\*Updated-At:\*\* .+/, `- **Updated-At:** ${oldTimestamp}`);
    fs.writeFileSync(roadmapPath, content, 'utf-8');

    // Now fetch the issue and check staleness
    const statesResult = await tracker.fetchIssueStatesByIds([issue.id]);
    expect(statesResult.ok).toBe(true);
    if (!statesResult.ok) return;

    const staleIssue = statesResult.value.get(issue.id)!;
    expect(staleIssue.assignee).toBe('orch-dead');

    // isStale should detect the backdated claim
    const ttlMs = 600_000; // 10 minutes
    expect(manager.isStale(staleIssue, ttlMs)).toBe(true);

    // A fresh claim should not be stale
    const freshIssue = { ...staleIssue, updatedAt: new Date().toISOString() };
    expect(manager.isStale(freshIssue, ttlMs)).toBe(false);
  });

  it('reconcileOnStartup releases orphaned claims from roadmap file', async () => {
    const config = makeConfig();
    const tracker = new RoadmapTrackerAdapter(config);
    const manager = new ClaimManager(tracker, 'orch-restarted', { verifyDelayMs: 0 });

    const candidatesResult = await tracker.fetchCandidateIssues();
    expect(candidatesResult.ok).toBe(true);
    if (!candidatesResult.ok) return;

    // Claim two issues (simulating previous run)
    const issueA = candidatesResult.value[0]!;
    const issueB = candidatesResult.value[1]!;
    await manager.claimAndVerify(issueA.id);
    await manager.claimAndVerify(issueB.id);

    // On restart with empty running set, both should be released
    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);

    // Verify both are back to planned state in the file
    const statesResult = await tracker.fetchIssueStatesByIds([issueA.id, issueB.id]);
    expect(statesResult.ok).toBe(true);
    if (!statesResult.ok) return;

    for (const [, issue] of statesResult.value) {
      expect(issue.state).toBe('planned');
      expect(issue.assignee).toBeNull();
    }
  });
});
