import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GraphStore } from '@harness-engineering/graph';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import { buildSignoffRouter } from '../../../src/server/routes/signoff';

function makeCtx(root: string): ServerContext {
  return {
    projectPath: root,
    roadmapPath: join(root, 'docs/roadmap.md'),
    chartsPath: join(root, 'docs/roadmap-charts.md'),
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager: undefined!,
    gatherCache: new GatherCache(),
  };
}

async function writeProposal(root: string, slug: string, body: string): Promise<void> {
  await mkdir(join(root, 'docs', 'changes', slug), { recursive: true });
  await writeFile(join(root, 'docs', 'changes', slug, 'proposal.md'), body, 'utf-8');
}

async function countOutcomeNodes(root: string): Promise<number> {
  const store = new GraphStore();
  await store.load(join(root, '.harness', 'graph'));
  return store.findNodes({ type: 'execution_outcome' }).length;
}

const SC_PROPOSAL = [
  '# Proposal',
  '',
  '## Success Criteria',
  '',
  '1. **First criterion.** does a thing.',
  '2. **Second criterion.** does another.',
  '',
].join('\n');

describe('signoff routes (#710)', () => {
  let root: string;
  let app: Hono;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'signoff-route-'));
    app = new Hono();
    app.route('/api', buildSignoffRouter(makeCtx(root)));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // AC-2
  it('GET returns the Success-Criteria basis for a change', async () => {
    await writeProposal(root, 'acme', SC_PROPOSAL);
    const res = await app.request('/api/signoff/acme');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { slug: string; items: { id: string; text: string }[]; basisSection: string | null };
    };
    expect(body.data.slug).toBe('acme');
    expect(body.data.basisSection).toBe('Success Criteria');
    expect(body.data.items.map((i) => i.id)).toEqual(['SC1', 'SC2']);
    expect(body.data.items[0]?.text).toContain('First criterion');
  });

  // AC-3
  it('GET soft-degrades to items:[]/basisSection:null for a missing proposal (HTTP 200)', async () => {
    const res = await app.request('/api/signoff/ghost');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { items: unknown[]; basisSection: null } };
    expect(body.data.items).toEqual([]);
    expect(body.data.basisSection).toBeNull();
  });

  // AC-4 + AC-5 + AC-9
  it('POST records exactly one execution_outcome node, writes signoff.md, and blocks nothing', async () => {
    await writeProposal(root, 'acme', SC_PROPOSAL);
    expect(await countOutcomeNodes(root)).toBe(0);

    const res = await app.request('/api/signoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'acme',
        decision: 'ACCEPTED',
        signedOffBy: 'Dana',
        items: [
          { id: 'SC1', disposition: 'ACCEPT' },
          { id: 'SC2', disposition: 'ACCEPT', note: 'great' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      recorded: boolean;
      outcomeId: string;
      result: string;
      signoffPath: string;
    };
    // AC-9: record-only confirmation shape
    expect(body.recorded).toBe(true);
    expect(body.result).toBe('success');
    expect(body.outcomeId).toContain('uat-signoff');
    expect(body.signoffPath).toBe(join('docs', 'changes', 'acme', 'signoff.md'));

    // AC-4: exactly one execution_outcome node, correct source + result
    const store = new GraphStore();
    await store.load(join(root, '.harness', 'graph'));
    const nodes = store.findNodes({ type: 'execution_outcome' });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.metadata?.['source']).toBe('uat-signoff');
    expect(nodes[0]?.metadata?.['result']).toBe('success');

    // AC-5: signoff.md written with the required fields + accepted/rejected split
    const md = await readFile(join(root, 'docs', 'changes', 'acme', 'signoff.md'), 'utf-8');
    expect(md).toContain('- **Overall decision:** ACCEPTED');
    expect(md).toContain('- **Signed off by:** Dana');
    expect(md).toMatch(/- \*\*Date:\*\* \d{4}-\d{2}-\d{2}T/);
    expect(md).toContain('## Accepted');
    expect(md).toContain('## Rejected / changes-requested');
  });

  // AC-4 — result=failure when not ACCEPTED
  it('POST records result=failure when the overall decision is not ACCEPTED', async () => {
    await writeProposal(root, 'acme', SC_PROPOSAL);
    const res = await app.request('/api/signoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'acme',
        decision: 'REJECTED',
        signedOffBy: 'Sam',
        items: [{ id: 'SC1', disposition: 'REJECT' }],
      }),
    });
    const body = (await res.json()) as { result: string };
    expect(body.result).toBe('failure');
    const store = new GraphStore();
    await store.load(join(root, '.harness', 'graph'));
    expect(store.findNodes({ type: 'execution_outcome' })[0]?.metadata?.['result']).toBe('failure');
  });

  // AC-6 — incomplete decisions are rejected, and nothing is recorded
  it.each([
    ['missing decision', { slug: 'acme', signedOffBy: 'Dana', items: [] }],
    ['missing signer', { slug: 'acme', decision: 'ACCEPTED', items: [] }],
    [
      'item without disposition',
      { slug: 'acme', decision: 'ACCEPTED', signedOffBy: 'Dana', items: [{ id: 'SC1' }] },
    ],
  ])(
    'POST rejects an incomplete decision (%s) with 4xx and records nothing',
    async (_label, payload) => {
      await writeProposal(root, 'acme', SC_PROPOSAL);
      const res = await app.request('/api/signoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(400);
      // No node written, no signoff.md written.
      expect(await countOutcomeNodes(root)).toBe(0);
      await expect(
        readFile(join(root, 'docs', 'changes', 'acme', 'signoff.md'), 'utf-8')
      ).rejects.toThrow();
    }
  );

  // Hardening — a traversal slug is rejected on both routes (never touches disk).
  it('rejects a path-traversal slug with 400 on GET and POST', async () => {
    const getRes = await app.request('/api/signoff/..%2f..%2fetc');
    expect(getRes.status).toBe(400);

    const postRes = await app.request('/api/signoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: '../../etc/passwd',
        decision: 'ACCEPTED',
        signedOffBy: 'Dana',
        items: [],
      }),
    });
    expect(postRes.status).toBe(400);
    expect(await countOutcomeNodes(root)).toBe(0);
  });

  // AC-8 — an already-signed change surfaces `existing`
  it('GET returns `existing` once a change has been signed off', async () => {
    await writeProposal(root, 'acme', SC_PROPOSAL);
    await app.request('/api/signoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'acme',
        decision: 'ACCEPTED',
        signedOffBy: 'Dana',
        items: [
          { id: 'SC1', disposition: 'ACCEPT' },
          { id: 'SC2', disposition: 'ACCEPT' },
        ],
      }),
    });

    const res = await app.request('/api/signoff/acme');
    const body = (await res.json()) as {
      data: { existing?: { decision: string; signedOffBy: string } };
    };
    expect(body.data.existing).toBeDefined();
    expect(body.data.existing?.decision).toBe('ACCEPTED');
    expect(body.data.existing?.signedOffBy).toBe('Dana');
  });
});

// AC-9 — the route module imports only the recorder + gather (file I/O); it pulls
// in no gate / CI / pipeline dependency, proving the sign-off blocks nothing.
describe('signoff route module dependencies (#710 AC-9)', () => {
  it('does not import any gate, CI, or pipeline module', async () => {
    const source = await readFile(
      join(__dirname, '..', '..', '..', 'src', 'server', 'routes', 'signoff.ts'),
      'utf-8'
    );
    // Only the import statements matter (prose comments legitimately name the
    // sibling eval contracts to draw the distinction).
    const importLines = source
      .split(/\r?\n/)
      .filter((l) => /^\s*import\b/.test(l) || /\bfrom\s+['"]/.test(l));
    for (const line of importLines) {
      expect(line).not.toMatch(
        /outcome-eval|acceptance-eval|run_ci|run-ci|check_phase_gate|check-phase-gate|pipeline|\/gates?\b/i
      );
    }
    // It DOES go through the shared recorder — the reuse the spec mandates.
    expect(source).toContain(
      "import { UatSignoffRecorder } from '@harness-engineering/intelligence'"
    );
  });
});
