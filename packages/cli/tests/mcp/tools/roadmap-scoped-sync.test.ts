/**
 * The row-scoped tracker push: outcome classification and the adapter
 * injection seam. No network — every tracker interaction goes through a stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { triggerScopedExternalSync } from '../../../src/mcp/tools/roadmap-auto-sync';
import * as autoSync from '../../../src/mcp/tools/roadmap-auto-sync';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';

const TRACKER_CONFIG = {
  roadmap: {
    tracker: {
      kind: 'github',
      repo: 'owner/repo',
      labels: ['harness-managed'],
      statusMap: {
        backlog: 'open',
        planned: 'open',
        'in-progress': 'open',
        done: 'closed',
        blocked: 'open',
      },
      reverseStatusMap: { open: 'planned', closed: 'done' },
    },
  },
};

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-link-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('triggerScopedExternalSync() — outcome classification', () => {
  it('returns not-configured when the project has no tracker config', async () => {
    const outcome = await triggerScopedExternalSync(dir, 'Anything');
    expect(outcome).toEqual({ kind: 'not-configured' });
  });

  it('returns no-token when a tracker is configured but GITHUB_TOKEN is absent', async () => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify(TRACKER_CONFIG),
      'utf-8'
    );
    vi.stubEnv('GITHUB_TOKEN', '');

    const outcome = await triggerScopedExternalSync(dir, 'Anything');

    expect(outcome).toEqual({ kind: 'no-token' });
  });
});

const ROADMAP_MD = `---
project: test-project
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Milestone: MVP Release

### Feature: Existing Row
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Pre-existing
`;

describe('manage_roadmap add — response annotation', () => {
  beforeEach(() => {
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), ROADMAP_MD, 'utf-8');
  });

  it('reports a link failure WITHOUT marking the response isError', async () => {
    vi.spyOn(autoSync, 'triggerScopedExternalSync').mockResolvedValue({
      kind: 'failed',
      reason: 'tracker 503',
    });

    const res = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'Billing',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'Billing system',
    });

    // The row WAS written and is locally valid; only the tracker link is
    // missing. Marking this isError would invite a retry that mints a
    // duplicate issue — the exact failure this fix exists to prevent.
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(res.content[0].text);
    expect(body.link).toEqual({ kind: 'failed', reason: 'tracker 503' });
    expect(body.message).toContain('tracker 503');
    expect(fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8')).toContain('Billing');
  });

  it('reports a missing token loudly but not fatally', async () => {
    vi.spyOn(autoSync, 'triggerScopedExternalSync').mockResolvedValue({ kind: 'no-token' });

    const res = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'Billing',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'Billing system',
    });

    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text).message).toContain('GITHUB_TOKEN');
  });

  it('annotates the response body with the External-ID before serializing it', async () => {
    vi.spyOn(autoSync, 'triggerScopedExternalSync').mockResolvedValue({
      kind: 'linked',
      externalId: 'github:owner/repo#42',
    });

    const res = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'Billing',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'Billing system',
    });

    const body = JSON.parse(res.content[0].text);
    const added = body.milestones
      .flatMap((m: { features: { name: string; externalId: string | null }[] }) => m.features)
      .find((f: { name: string }) => f.name === 'Billing');
    expect(added.externalId).toBe('github:owner/repo#42');
    // Envelope convention: the roadmap shape is spread, so every consumer
    // reading .milestones / .assignmentHistory is unaffected.
    expect(body.milestones).toBeDefined();
    expect(body.link).toEqual({ kind: 'linked', externalId: 'github:owner/repo#42' });
  });

  it('stays silent when no tracker is configured', async () => {
    const res = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'Billing',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'Billing system',
    });

    expect(res.isError).toBeFalsy();
    const body = JSON.parse(res.content[0].text);
    expect(body.link).toEqual({ kind: 'not-configured' });
    expect(body.message).toBeUndefined();
  });
});
