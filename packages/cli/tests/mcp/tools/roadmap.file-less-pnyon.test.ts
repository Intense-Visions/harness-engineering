/**
 * File-less `manage_roadmap` semantics through a pnyon (Waypoint) adapter
 * (docs/changes/waypoint-tracker-kind-pnyon/proposal.md SC8): the generic
 * file-less handler needs zero per-adapter work — `groom` stays unsupported,
 * `sync` stays the documented no-op (the tracker IS the sync target), and
 * reads flow through the adapter unchanged.
 *
 * The Waypoint transport is a minimal inline mock of the documented contract
 * (full contract coverage lives in core's pnyon adapter suite).
 */
import { describe, it, expect } from 'vitest';
import { PnyonTrackerAdapter } from '@harness-engineering/core';
import { handleManageRoadmapFileLess } from '../../../src/mcp/tools/roadmap-file-less';

const BASE = 'https://waypoint.test/o/outpost-1';

/** Minimal mock: one seeded item behind GET /v1/items; everything else 404. */
function makeAdapter(): PnyonTrackerAdapter {
  const item = {
    id: '01MOCKULID0000000000000001',
    name: 'Seeded feature',
    status: 'planned',
    summary: 'seeded',
    spec: null,
    plans: [],
    blockedBy: [],
    assignee: null,
    priority: null,
    milestone: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    version: 1,
  };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET' && url.startsWith(`${BASE}/v1/items`)) {
      return new Response(JSON.stringify({ items: [item] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: 'W/"list-1"' },
      });
    }
    return new Response(JSON.stringify({ error: 'no route' }), { status: 404 });
  };
  return new PnyonTrackerAdapter({ url: BASE, token: 'tok', fetchFn });
}

describe('manage_roadmap file-less semantics with the pnyon adapter (SC8)', () => {
  it('groom is unsupported in file-less mode (error, tracker untouched)', async () => {
    const res = await handleManageRoadmapFileLess(
      { path: '/tmp/x', action: 'groom' },
      makeAdapter()
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/groom is only supported in file-based roadmap mode/);
  });

  it('sync is a no-op (the tracker is canonical)', async () => {
    const res = await handleManageRoadmapFileLess(
      { path: '/tmp/x', action: 'sync' },
      makeAdapter()
    );
    expect(res.isError).toBeUndefined();
    expect(res.content[0]!.text).toMatch(/file-less mode; tracker is canonical/);
  });

  it('show flows through the adapter unchanged', async () => {
    const res = await handleManageRoadmapFileLess(
      { path: '/tmp/x', action: 'show' },
      makeAdapter()
    );
    expect(res.isError).toBeUndefined();
    expect(res.content[0]!.text).toContain('Seeded feature');
    expect(res.content[0]!.text).toContain('status: planned');
  });
});
