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

describe('scoped push end to end (sharded project, stub tracker)', () => {
  // Sharded fixture: the target row plus two unrelated rows whose tickets
  // carry exactly the two inbound hazards D3 guards against.
  function writeShardedProject(): void {
    const shardDir = path.join(dir, 'docs', 'roadmap.d');
    fs.mkdirSync(shardDir, { recursive: true });
    // Real shard format (slug/milestone/order frontmatter + H3 heading + the
    // `- **Field:** value` block), matching serializeMeta / serializeShard.
    fs.writeFileSync(
      path.join(shardDir, '_meta.md'),
      [
        '---',
        'project: "test-project"',
        'version: 1',
        'last_synced: "2026-01-01T00:00:00Z"',
        'last_manual_edit: "2026-01-01T00:00:00Z"',
        'milestones:',
        '  - "MVP Release"',
        '---',
        '',
      ].join('\n'),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(shardDir, 'owned-row.md'),
      [
        '---',
        'slug: "owned-row"',
        'milestone: "MVP Release"',
        'order: 0',
        '---',
        '',
        '### Owned Row',
        '',
        '- **Status:** in-progress',
        '- **Spec:** —',
        '- **Summary:** Assigned locally',
        '- **Blockers:** —',
        '- **Plan:** —',
        '- **Assignee:** @alice',
        '- **Priority:** —',
        '- **External-ID:** github:owner/repo#7',
        '',
      ].join('\n'),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(shardDir, 'idea-row.md'),
      [
        '---',
        'slug: "idea-row"',
        'milestone: "MVP Release"',
        'order: 1',
        '---',
        '',
        '### Idea Row',
        '',
        '- **Status:** backlog',
        '- **Spec:** —',
        '- **Summary:** Just an idea',
        '- **Blockers:** —',
        '- **Plan:** —',
        '- **Assignee:** —',
        '- **Priority:** —',
        '- **External-ID:** github:owner/repo#8',
        '',
      ].join('\n'),
      'utf-8'
    );
  }

  function snapshotShards(): Map<string, string> {
    const shardDir = path.join(dir, 'docs', 'roadmap.d');
    const snap = new Map<string, string>();
    for (const name of fs.readdirSync(shardDir)) {
      const full = path.join(shardDir, name);
      if (fs.statSync(full).isFile()) snap.set(name, fs.readFileSync(full, 'utf-8'));
    }
    return snap;
  }

  /** Stub tracker carrying both inbound hazards. Only the target row is unlinked. */
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
      fetchAllTickets: vi.fn(async () => ({
        ok: true,
        value: [
          // (i) unrelated assigned row, tracker reports nobody
          {
            externalId: 'github:owner/repo#7',
            title: 'Owned Row',
            status: 'open',
            labels: ['harness-managed'],
            assignee: null,
          },
          // (ii) unrelated backlog row, bare OPEN with no status label
          {
            externalId: 'github:owner/repo#8',
            title: 'Idea Row',
            status: 'open',
            labels: ['harness-managed'],
            assignee: null,
          },
        ],
      })),
      assignTicket: vi.fn(async () => ({ ok: true, value: undefined })),
      addComment: vi.fn(async () => ({ ok: true, value: undefined })),
      fetchComments: vi.fn(async () => ({ ok: true, value: [] })),
    };
  }

  beforeEach(() => {
    writeShardedProject();
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify(TRACKER_CONFIG),
      'utf-8'
    );
    vi.stubEnv('GITHUB_TOKEN', 'stub-token');
  });

  it('links the added row and leaves every unrelated shard byte-identical', async () => {
    const linkSpy = vi
      .spyOn(autoSync, 'triggerScopedExternalSync')
      .mockResolvedValue({ kind: 'not-configured' });

    await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'Billing',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'Billing system',
    });
    linkSpy.mockRestore();

    const before = snapshotShards();
    const adapter = stubAdapter();

    const outcome = await triggerScopedExternalSync(dir, 'Billing', {
      makeAdapter: () => adapter as never,
    });

    expect(outcome).toEqual({ kind: 'linked', externalId: 'github:owner/repo#99' });

    const after = snapshotShards();
    // SC2: neither unrelated row was rewritten, in either direction.
    expect(after.get('owned-row.md')).toBe(before.get('owned-row.md'));
    expect(after.get('idea-row.md')).toBe(before.get('idea-row.md'));
    expect(after.get('owned-row.md')).toContain('- **Assignee:** @alice');
    expect(after.get('idea-row.md')).toContain('- **Status:** backlog');

    // SC6: the new row carries its External-ID, and stamping externalId flips
    // hasExtended so the whole extended triple is emitted — no serializer change.
    const billing = after.get('billing.md')!;
    expect(billing).toContain('- **Assignee:** —');
    expect(billing).toContain('- **Priority:** —');
    expect(billing).toContain('- **External-ID:** github:owner/repo#99');

    // No write ever named another row's ticket.
    for (const call of adapter.updateTicket.mock.calls) {
      expect(call[0]).toBe('github:owner/repo#99');
    }
    expect(adapter.createTicket).toHaveBeenCalledOnce();
  });
});
