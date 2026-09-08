import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
- **Assignee:** owner-a

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
let empty: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-cov-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), FIXTURE_ROADMAP, 'utf-8');
  empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-cov-empty-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('handleManageRoadmap — top-level guards', () => {
  it('returns a graceful error when path is missing (sanitizePath throws)', async () => {
    const r = await handleManageRoadmap({ action: 'show' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/Error:/);
  });
});

describe('handleManageRoadmap — roadmap-not-found for every mutating/read action', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['show', { action: 'show' }],
    ['add', { action: 'add', feature: 'X', milestone: 'MVP', status: 'planned', summary: 'S' }],
    ['update', { action: 'update', feature: 'X' }],
    ['remove', { action: 'remove', feature: 'X' }],
    ['promote', { action: 'promote', feature: 'X', spec: 'docs/s.md' }],
    ['query', { action: 'query', filter: 'planned' }],
    ['sync', { action: 'sync' }],
    ['groom', { action: 'groom' }],
  ];
  for (const [name, extra] of cases) {
    it(`${name}: reports roadmap not found`, async () => {
      const r = await handleManageRoadmap({ path: empty, ...extra } as never);
      expect(r.isError).toBe(true);
      expect(r.content[0]?.text).toMatch(/roadmap not found/i);
    });
  }
});

describe('handleManageRoadmap — validation guards (fire before roadmap check)', () => {
  it('add: missing each required field returns a field error', async () => {
    const r = await handleManageRoadmap({ path: empty, action: 'add', feature: 'X' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/is required for add/i);
  });

  it('update: missing feature is an error', async () => {
    const r = await handleManageRoadmap({ path: empty, action: 'update' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/feature is required for update/i);
  });

  it('remove: missing feature is an error', async () => {
    const r = await handleManageRoadmap({ path: empty, action: 'remove' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/feature is required for remove/i);
  });

  it('promote: missing feature is an error', async () => {
    const r = await handleManageRoadmap({ path: empty, action: 'promote', spec: 's' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/feature is required for promote/i);
  });

  it('promote: missing spec is an error', async () => {
    const r = await handleManageRoadmap({ path: empty, action: 'promote', feature: 'X' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/spec is required for promote/i);
  });

  it('query: missing filter is an error', async () => {
    const r = await handleManageRoadmap({ path: empty, action: 'query' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/filter is required for query/i);
  });
});

describe('handleManageRoadmap — show/query on a real roadmap', () => {
  it('show returns all features', async () => {
    const r = await handleManageRoadmap({ path: dir, action: 'show' } as never);
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.text).toContain('Auth');
    expect(r.content[0]?.text).toContain('Mobile');
  });

  it('show filters by milestone (case-insensitive)', async () => {
    const r = await handleManageRoadmap({ path: dir, action: 'show', milestone: 'mvp' } as never);
    expect(r.isError).toBeUndefined();
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Auth');
    expect(text).not.toContain('Mobile');
  });

  it('show filters by status', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'show',
      status: 'backlog',
    } as never);
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Mobile');
    expect(text).not.toContain('Dashboard');
  });

  it('query by status returns matching features', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'query',
      filter: 'planned',
    } as never);
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.text).toContain('Dashboard');
  });

  it('query by milestone:<name> returns that milestone', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'query',
      filter: 'milestone:MVP',
    } as never);
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.text).toContain('Auth');
  });
});

describe('handleManageRoadmap — add / update / remove mutations', () => {
  it('add: milestone not found is an error', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'New',
      milestone: 'Nonexistent',
      status: 'planned',
      summary: 'S',
    } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/milestone .* not found/i);
  });

  it('add: appends a feature to an existing milestone', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'NewFeature',
      milestone: 'MVP',
      status: 'planned',
      summary: 'brand new',
    } as never);
    expect(r.isError).toBeUndefined();
    const onDisk = fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8');
    expect(onDisk).toContain('NewFeature');
  });

  it('update: unknown feature is an error', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'DoesNotExist',
      status: 'done',
    } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/not found/i);
  });

  it('update: changes a status and persists', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Dashboard',
      status: 'in-progress',
      assignee: 'dev-x',
    } as never);
    expect(r.isError).toBeUndefined();
    const onDisk = fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8');
    expect(onDisk).toContain('dev-x');
  });

  it('update: claiming an already-in-progress row under a new owner is refused', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Auth',
      assignee: 'someone-else',
    } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/claim refused/i);
  });

  it('update: releasing a claim (empty assignee) succeeds', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Auth',
      status: 'planned',
    } as never);
    expect(r.isError).toBeUndefined();
  });

  it('remove: unknown feature is an error', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'remove',
      feature: 'DoesNotExist',
    } as never);
    expect(r.isError).toBe(true);
  });

  it('remove: deletes an existing feature', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'remove',
      feature: 'Mobile',
    } as never);
    expect(r.isError).toBeUndefined();
    const onDisk = fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8');
    expect(onDisk).not.toContain('Mobile app');
  });
});

describe('handleManageRoadmap — promote / sync / groom', () => {
  it('promote: malformed roadmap yields a write-failed envelope', async () => {
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), 'not a roadmap at all', 'utf-8');
    const r = await handleManageRoadmap({
      path: dir,
      action: 'promote',
      feature: 'Whatever',
      spec: 'docs/s.md',
    } as never);
    expect(r.isError).toBe(true);
    const env = JSON.parse(r.content[0]?.text ?? '{}');
    expect(env.ok).toBe(false);
  });

  it('promote: an existing backlog row transitions', async () => {
    const r = await handleManageRoadmap({
      path: dir,
      action: 'promote',
      feature: 'Mobile',
      spec: 'docs/changes/mobile/proposal.md',
    } as never);
    const env = JSON.parse(r.content[0]?.text ?? '{}');
    expect(env.ok).toBe(true);
  });

  it('sync: reports up-to-date or a change set without applying', async () => {
    const r = await handleManageRoadmap({ path: dir, action: 'sync' } as never);
    expect(r.isError).toBeUndefined();
  });

  it('groom: reports already-tidy or a change set', async () => {
    const r = await handleManageRoadmap({ path: dir, action: 'groom' } as never);
    expect(r.isError).toBeUndefined();
  });
});
