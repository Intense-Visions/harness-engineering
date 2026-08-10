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

  it('offers the recovery that works, and warns off the one that cannot', async () => {
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

    const { message } = JSON.parse(res.content[0].text);
    // Re-running add fails 100% of the time on exactly this path: the row is
    // already persisted, so the second add pushes a duplicate slug and
    // applyRoadmapDiff rejects the write. Only sync can repair it.
    expect(message).toMatch(/do not re-run add/i);
    expect(message).toContain('sync');
    expect(message).toContain('apply=true');
    expect(message).not.toMatch(/re-running add is safe/i);
    // No orphan on this outcome, so the unlinked clause is the true one.
    expect(message).toContain('no External-ID');
  });

  it('names the orphaned ticket instead of claiming the row has no External-ID', async () => {
    vi.spyOn(autoSync, 'triggerScopedExternalSync').mockResolvedValue({
      kind: 'failed',
      reason: 'writeback failed (ticket github:owner/repo#42 exists ...)',
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

    const { message } = JSON.parse(res.content[0].text);
    expect(message).toContain('github:owner/repo#42');
    expect(message).not.toContain('no External-ID');
  });

  it('reports a linked-with-warning outcome without calling it a link failure', async () => {
    vi.spyOn(autoSync, 'triggerScopedExternalSync').mockResolvedValue({
      kind: 'linked',
      externalId: 'github:owner/repo#42',
      warning: 'tracker 500',
    });

    const res = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'Billing',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'Billing system',
    });

    expect(res.isError).toBeFalsy();
    const { message, link } = JSON.parse(res.content[0].text);
    expect(link.kind).toBe('linked');
    expect(message).toContain('tracker 500');
    expect(message).not.toMatch(/link failed/i);
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

/** One shard file in the real format (frontmatter + H3 heading + field block). */
function writeShard(
  shardDir: string,
  slug: string,
  order: number,
  heading: string,
  lines: string[]
): void {
  fs.writeFileSync(
    path.join(shardDir, `${slug}.md`),
    [
      '---',
      `slug: "${slug}"`,
      'milestone: "MVP Release"',
      `order: ${order}`,
      '---',
      '',
      `### ${heading}`,
      '',
      ...lines,
      '',
    ].join('\n'),
    'utf-8'
  );
}

/** Sharded fixture: two already-linked rows, neither of them the push target. */
function writeShardedProject(dir: string): void {
  const shardDir = path.join(dir, 'docs', 'roadmap.d');
  fs.mkdirSync(shardDir, { recursive: true });
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
  writeShard(shardDir, 'owned-row', 0, 'Owned Row', [
    '- **Status:** in-progress',
    '- **Spec:** —',
    '- **Summary:** Assigned locally',
    '- **Blockers:** —',
    '- **Plan:** —',
    '- **Assignee:** @alice',
    '- **Priority:** —',
    '- **External-ID:** github:owner/repo#7',
  ]);
  writeShard(shardDir, 'idea-row', 1, 'Idea Row', [
    '- **Status:** backlog',
    '- **Spec:** —',
    '- **Summary:** Just an idea',
    '- **Blockers:** —',
    '- **Plan:** —',
    '- **Assignee:** —',
    '- **Priority:** —',
    '- **External-ID:** github:owner/repo#8',
  ]);
}

function snapshotShards(dir: string): Map<string, string> {
  const shardDir = path.join(dir, 'docs', 'roadmap.d');
  const snap = new Map<string, string>();
  for (const name of fs.readdirSync(shardDir)) {
    const full = path.join(shardDir, name);
    if (fs.statSync(full).isFile()) snap.set(name, fs.readFileSync(full, 'utf-8'));
  }
  return snap;
}

type StubOverrides = Partial<Record<'createTicket' | 'updateTicket' | 'fetchAllTickets', unknown>>;

/**
 * Stub tracker. The two pre-linked tickets here are only there to make the
 * unrelated rows REACHABLE by a push — they are NOT D3 coverage: the scoped
 * path runs no inbound pull, so this fixture would pass with D3 fully
 * reverted. D3 is covered in packages/core/tests/roadmap/sync-engine-guards.
 */
function stubAdapter(overrides: StubOverrides = {}) {
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
        {
          externalId: 'github:owner/repo#7',
          title: 'Owned Row',
          status: 'open',
          labels: ['harness-managed'],
          assignee: null,
        },
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
    ...overrides,
  };
}

describe('scoped push end to end (sharded project, stub tracker)', () => {
  beforeEach(() => {
    writeShardedProject(dir);
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

    const before = snapshotShards(dir);
    const adapter = stubAdapter();

    const outcome = await triggerScopedExternalSync(dir, 'Billing', {
      makeAdapter: () => adapter as never,
    });

    expect(outcome).toEqual({ kind: 'linked', externalId: 'github:owner/repo#99' });

    const after = snapshotShards(dir);
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

    // The create path issues no patch at all, so the loop below is vacuous
    // unless this holds — assert the count, not just the arguments.
    expect(adapter.updateTicket).not.toHaveBeenCalled();
    for (const call of adapter.updateTicket.mock.calls) {
      expect(call[0]).toBe('github:owner/repo#99');
    }
    expect(adapter.createTicket).toHaveBeenCalledOnce();
  });

  it('SC6 through the real add path: response and disk agree, no mock in between', async () => {
    // A pass-through spy, not a stub. Every other add test replaces the link
    // wholesale, and the test above restores the spy and then calls the push
    // BY HAND — so nothing exercises handleAdd -> triggerScopedExternalSync ->
    // syncRowToExternal as one path. Deleting handleAdd's `linked` stamp block,
    // or passing it the wrong feature name, passes every other test here.
    const adapter = stubAdapter();
    const real = autoSync.triggerScopedExternalSync;
    vi.spyOn(autoSync, 'triggerScopedExternalSync').mockImplementation((p, f) =>
      real(p, f, { makeAdapter: () => adapter as never })
    );

    const res = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'Billing',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'Billing system',
    });

    // One call, and BOTH the response body…
    const body = JSON.parse(res.content[0].text);
    expect(body.link).toEqual({ kind: 'linked', externalId: 'github:owner/repo#99' });
    const added = body.milestones
      .flatMap((m: { features: { name: string; externalId: string | null }[] }) => m.features)
      .find((f: { name: string }) => f.name === 'Billing');
    expect(added.externalId).toBe('github:owner/repo#99');

    // …and the shard on disk carry the external id.
    expect(snapshotShards(dir).get('billing.md')).toContain(
      '- **External-ID:** github:owner/repo#99'
    );
  });
});

/** Monolith roadmap whose two rows slugify identically, so any writeback fails. */
const SLUG_COLLISION_MD = `---
project: test-project
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Milestone: MVP Release

### Feature: Target Row
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** The push target

### Feature: Dup Row
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Collides with the next row

### Feature: Dup-Row
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Collides with the previous row
`;

describe('triggerScopedExternalSync() — outcome derives from the row, not from created/updated', () => {
  beforeEach(() => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify(TRACKER_CONFIG),
      'utf-8'
    );
    vi.stubEnv('GITHUB_TOKEN', 'stub-token');
  });

  it('reports linked (with a warning) when the row dedup-links but the patch fails', async () => {
    // created and updated are BOTH empty here, yet the row is linked on disk.
    // Classifying on those arrays reported `failed` with no orphan named, and
    // handleAdd then skipped its stamp — a response saying externalId: null
    // for a row that is linked. That divergence is what this asserts against.
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), ROADMAP_MD, 'utf-8');
    const adapter = stubAdapter({
      fetchAllTickets: vi.fn(async () => ({
        ok: true,
        value: [
          {
            externalId: 'github:owner/repo#42',
            title: 'Existing Row',
            status: 'open',
            labels: ['harness-managed'],
            assignee: null,
          },
        ],
      })),
      updateTicket: vi.fn(async () => ({ ok: false, error: new Error('tracker 500') })),
    });

    const outcome = await triggerScopedExternalSync(dir, 'Existing Row', {
      makeAdapter: () => adapter as never,
    });

    expect(outcome).toEqual({
      kind: 'linked',
      externalId: 'github:owner/repo#42',
      warning: 'tracker 500',
    });
    expect(fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8')).toContain(
      '- **External-ID:** github:owner/repo#42'
    );
  });

  it('reports failed and names the orphan when the create lands but the writeback does not', async () => {
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), SLUG_COLLISION_MD, 'utf-8');
    const adapter = stubAdapter({ fetchAllTickets: vi.fn(async () => ({ ok: true, value: [] })) });

    const outcome = await triggerScopedExternalSync(dir, 'Target Row', {
      makeAdapter: () => adapter as never,
    });

    expect(adapter.createTicket).toHaveBeenCalledOnce();
    expect(outcome.kind).toBe('failed');
    // The operator has to be able to find the ticket nobody is pointing at.
    expect(outcome).toMatchObject({ externalId: 'github:owner/repo#99' });
    const reason = (outcome as { reason: string }).reason;
    expect(reason).toContain('github:owner/repo#99');
    expect(reason).toContain('Slug collision');
    expect(fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8')).not.toContain(
      'External-ID'
    );
  });
});
