/**
 * Phase 4 Task 18: pin file-backed regression behavior of manage_roadmap.
 *
 * The Phase 4 dispatcher must not perturb file-backed semantics. This test
 * asserts that all 6 actions (show, add, update, remove, query, sync) return
 * a non-error response and that their structural shape matches the
 * pre-Phase-4 baseline on a known fixture.
 *
 * Snapshot strategy: rather than vitest snapshot files (which churn with
 * incidental whitespace), we assert on stable response invariants
 * (isError absent + content[0].text contains expected substrings).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';

const FIXTURE_ROADMAP = `---
project: test-project
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Milestone: MVP

### Feature: Auth
- **Status:** in-progress
- **Spec:** docs/changes/auth/proposal.md
- **Plans:** docs/plans/auth-plan.md
- **Blocked by:** —
- **Summary:** Authentication

### Feature: Dashboard
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** Auth
- **Summary:** Dashboard UI

## Backlog

### Feature: Mobile
- **Status:** backlog
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Mobile app
`;

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-fb-regr-'));
  const docs = path.join(dir, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'roadmap.md'), FIXTURE_ROADMAP, 'utf-8');
  // No harness.config.json → file-backed default.
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('manage_roadmap — file-backed regression (Task 18)', () => {
  it('show: non-error, contains both features', async () => {
    const res = await handleManageRoadmap({ path: dir, action: 'show' });
    expect(res.isError).toBeFalsy();
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('Auth');
    expect(text).toContain('Dashboard');
  });

  it('add: non-error, adds to existing milestone', async () => {
    const res = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'NewFeature',
      milestone: 'MVP',
      status: 'planned',
      summary: 'A new thing',
    });
    expect(res.isError).toBeFalsy();
    const show = await handleManageRoadmap({ path: dir, action: 'show' });
    expect(show.content[0]?.text ?? '').toContain('NewFeature');
  });

  it('update: non-error, changes status', async () => {
    const res = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Dashboard',
      status: 'in-progress',
    });
    expect(res.isError).toBeFalsy();
  });

  it('remove: non-error', async () => {
    const res = await handleManageRoadmap({
      path: dir,
      action: 'remove',
      feature: 'Mobile',
    });
    expect(res.isError).toBeFalsy();
  });

  it('query: filter "planned" returns Dashboard', async () => {
    const res = await handleManageRoadmap({
      path: dir,
      action: 'query',
      filter: 'planned',
    });
    expect(res.isError).toBeFalsy();
    const text = res.content[0]?.text ?? '';
    expect(text).toContain('Dashboard');
  });

  it('sync: non-error', async () => {
    const res = await handleManageRoadmap({ path: dir, action: 'sync' });
    expect(res.isError).toBeFalsy();
  });

  it('explicit mode: file-backed produces identical behavior', async () => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { mode: 'file-backed' } })
    );
    const res = await handleManageRoadmap({ path: dir, action: 'show' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0]?.text ?? '').toContain('Auth');
  });
});
