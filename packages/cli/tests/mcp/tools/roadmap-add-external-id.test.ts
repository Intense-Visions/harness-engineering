/**
 * `manage_roadmap add` with a caller-supplied `external_id` (#2328).
 *
 * issue-fleet adds a roadmap row for an issue that ALREADY EXISTS on the
 * tracker. The add must therefore record the supplied External-ID, never ask
 * the tracker to create a ticket (that would mint a duplicate issue), be
 * idempotent by External-ID, and return a compact envelope instead of the whole
 * roadmap. No network — every tracker interaction goes through a stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as autoSync from '../../../src/mcp/tools/roadmap-auto-sync';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';
import { handleManageRoadmapFileLess } from '../../../src/mcp/tools/roadmap-file-less';

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

function stubAdapter() {
  return {
    createTicket: vi.fn(async () => ({
      ok: true,
      value: { externalId: 'github:owner/repo#99', url: 'https://x/99' },
    })),
    updateTicket: vi.fn(async (id: string) => ({
      ok: true,
      value: { externalId: id, url: 'https://x' },
    })),
    fetchTicketState: vi.fn(async () => ({ ok: false, error: new Error('unused') })),
    fetchAllTickets: vi.fn(async () => ({ ok: true, value: [] })),
    assignTicket: vi.fn(async () => ({ ok: true, value: undefined })),
    addComment: vi.fn(async () => ({ ok: true, value: undefined })),
    fetchComments: vi.fn(async () => ({ ok: true, value: [] })),
  };
}

let dir: string;
let adapter: ReturnType<typeof stubAdapter>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'add-external-id-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), ROADMAP_MD, 'utf-8');
  fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(TRACKER_CONFIG), 'utf-8');
  vi.stubEnv('GITHUB_TOKEN', 'stub-token');
  // Route the REAL row-scoped push through a stub tracker, so a create would be
  // observable as a createTicket call rather than a network request.
  adapter = stubAdapter();
  const real = autoSync.triggerScopedExternalSync;
  vi.spyOn(autoSync, 'triggerScopedExternalSync').mockImplementation((p, f) =>
    real(p, f, { makeAdapter: () => adapter as never })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ROUTED = {
  action: 'add' as const,
  feature: 'Issue 2328: add roadmap rows on route',
  milestone: 'MVP Release',
  status: 'backlog' as const,
  summary: 'Routed by issue-fleet',
  external_id: 'github:owner/repo#2328',
};

function rowsWith(externalId: string): number {
  const md = fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8');
  return md.split(`- **External-ID:** ${externalId}`).length - 1;
}

describe('manage_roadmap add with external_id', () => {
  it('records the supplied External-ID and never asks the tracker to create a ticket', async () => {
    const res = await handleManageRoadmap({ path: dir, ...ROUTED });

    expect(res.isError).toBeFalsy();
    expect(rowsWith('github:owner/repo#2328')).toBe(1);
    expect(adapter.createTicket).not.toHaveBeenCalled();
    expect(adapter.updateTicket).not.toHaveBeenCalled();
    expect(adapter.fetchAllTickets).not.toHaveBeenCalled();
  });

  it('is idempotent by External-ID: adding twice yields one row and zero creations', async () => {
    const first = await handleManageRoadmap({ path: dir, ...ROUTED });
    // Same issue routed again, even under a different title.
    const second = await handleManageRoadmap({
      path: dir,
      ...ROUTED,
      feature: 'A retitled duplicate of the same issue',
    });

    expect(first.isError).toBeFalsy();
    expect(second.isError).toBeFalsy();
    expect(JSON.parse(first.content[0].text)).toMatchObject({
      added: true,
      externalId: 'github:owner/repo#2328',
    });
    expect(JSON.parse(second.content[0].text)).toMatchObject({
      added: false,
      externalId: 'github:owner/repo#2328',
      feature: ROUTED.feature,
    });
    expect(rowsWith('github:owner/repo#2328')).toBe(1);
    expect(adapter.createTicket).not.toHaveBeenCalled();
  });

  it('returns a compact envelope, not the whole roadmap', async () => {
    const res = await handleManageRoadmap({ path: dir, ...ROUTED });
    const body = JSON.parse(res.content[0].text);
    expect(body.milestones).toBeUndefined();
    expect(body).toMatchObject({
      added: true,
      feature: ROUTED.feature,
      milestone: 'MVP Release',
      externalId: 'github:owner/repo#2328',
    });
  });

  it('rejects a malformed external_id without writing anything', async () => {
    const before = fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8');
    const res = await handleManageRoadmap({
      path: dir,
      ...ROUTED,
      external_id: 'github:owner/repo#1\n- **Status:** done',
    });
    expect(res.isError).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8')).toBe(before);
  });

  it('positive control: add WITHOUT external_id still creates and links a ticket', async () => {
    const { external_id: _omit, ...plain } = ROUTED;
    const res = await handleManageRoadmap({ path: dir, ...plain });

    expect(res.isError).toBeFalsy();
    expect(adapter.createTicket).toHaveBeenCalledOnce();
    const body = JSON.parse(res.content[0].text);
    expect(body.link).toEqual({ kind: 'linked', externalId: 'github:owner/repo#99' });
    expect(body.milestones).toBeDefined();
    expect(rowsWith('github:owner/repo#99')).toBe(1);
  });
});

describe('manage_roadmap add with external_id — file-less mode', () => {
  it('refuses instead of creating a tracker issue (the issue already IS the row)', async () => {
    const client = { create: vi.fn() };
    const res = await handleManageRoadmapFileLess({ path: dir, ...ROUTED }, client as never);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/file-less/i);
    expect(client.create).not.toHaveBeenCalled();
  });
});
