import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createProposal, getProposal } from '@harness-engineering/core';
import type {
  EvictPoolResult,
  InstallPoolResult,
  PoolEntry,
  PoolState,
} from '@harness-engineering/local-models';
import { handleV1ProposalsRoute } from './proposals';
import { runGate } from '../../../proposals/gate';
import type { ModelPoolOps } from '../../../proposals/model-handlers';

function makeReqRes(
  method: string,
  url: string,
  body?: string
): { req: IncomingMessage; res: ServerResponse; sent: () => { status: number; body: string } } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  if (body) {
    process.nextTick(() => {
      req.push(body);
      req.push(null);
    });
  } else {
    req.push(null);
  }
  const res = new ServerResponse(req);
  let status = 0;
  let buf = '';
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = ((s: number, ...rest: unknown[]) => {
    status = s;
    return origWriteHead(s, ...(rest as []));
  }) as typeof res.writeHead;
  const origEnd = res.end.bind(res);
  res.end = ((chunk?: unknown) => {
    if (typeof chunk === 'string') buf += chunk;
    return origEnd(chunk as never);
  }) as typeof res.end;
  return { req, res, sent: () => ({ status, body: buf }) };
}

async function settle(): Promise<void> {
  // Wait one macrotask + microtask flush for the async route to write.
  await new Promise((r) => setTimeout(r, 20));
}

let tmpDir: string;
let bus: EventEmitter;

const NEW_SKILL_INPUT = {
  kind: 'new-skill' as const,
  proposedBy: 'tester',
  justification:
    'Captures a recurring migration pattern observed across three sessions in the past week.',
  content: {
    name: 'auto-rename-helpers',
    description: 'Renames helper modules and rewrites their imports across the workspace.',
    skillYaml: 'name: auto-rename-helpers\nversion: "0.1.0"\ndescription: A nice description.\n',
    skillMd: '# Auto Rename Helpers\n\nA fairly long description for the gate-md check.\n',
  },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proposals-route-'));
  bus = new EventEmitter();
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/v1/proposals', () => {
  it('returns an empty array when no proposals exist', async () => {
    const { req, res, sent } = makeReqRes('GET', '/api/v1/proposals');
    const handled = handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    expect(handled).toBe(true);
    await settle();
    expect(sent().status).toBe(200);
    expect(JSON.parse(sent().body)).toEqual([]);
  });

  it('returns the open proposals', async () => {
    await createProposal(tmpDir, NEW_SKILL_INPUT);
    const { req, res, sent } = makeReqRes('GET', '/api/v1/proposals?status=open');
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    const body = JSON.parse(sent().body) as Array<{ status: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.status).toBe('open');
  });
});

describe('GET /api/v1/proposals/:id', () => {
  it('returns the proposal by id', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const { req, res, sent } = makeReqRes('GET', `/api/v1/proposals/${p.id}`);
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    expect(sent().status).toBe(200);
    expect(JSON.parse(sent().body)).toMatchObject({ id: p.id });
  });

  it('returns 404 for an unknown id', async () => {
    const { req, res, sent } = makeReqRes('GET', '/api/v1/proposals/proposal_missing');
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    expect(sent().status).toBe(404);
  });
});

describe('POST /api/v1/proposals/:id/run-gate', () => {
  it('runs the gate and returns findings', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const { req, res, sent } = makeReqRes('POST', `/api/v1/proposals/${p.id}/run-gate`);
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    expect(sent().status).toBe(200);
    const out = JSON.parse(sent().body) as { status: string };
    expect(out.status).toBe('gate-running');
  });
});

describe('POST /api/v1/proposals/:id/approve', () => {
  it('refuses when the gate has not run', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const { req, res, sent } = makeReqRes(
      'POST',
      `/api/v1/proposals/${p.id}/approve`,
      JSON.stringify({ decidedBy: 'cwarner' })
    );
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    expect(sent().status).toBe(409);
  });

  it('promotes when the gate has run cleanly and emits proposal.approved', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    await runGate(tmpDir, p.id);
    const seen: unknown[] = [];
    bus.on('proposal.approved', (d) => seen.push(d));
    const { req, res, sent } = makeReqRes(
      'POST',
      `/api/v1/proposals/${p.id}/approve`,
      JSON.stringify({ decidedBy: 'cwarner' })
    );
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    expect(sent().status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(
      fs.existsSync(path.join(tmpDir, 'agents', 'skills', 'claude-code', 'auto-rename-helpers'))
    ).toBe(true);
  });
});

describe('POST /api/v1/proposals/:id/reject', () => {
  it('marks the proposal rejected and emits proposal.rejected', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const seen: unknown[] = [];
    bus.on('proposal.rejected', (d) => seen.push(d));
    const { req, res, sent } = makeReqRes(
      'POST',
      `/api/v1/proposals/${p.id}/reject`,
      JSON.stringify({ reason: 'duplicate of existing skill' })
    );
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    expect(sent().status).toBe(200);
    const out = JSON.parse(sent().body) as { status: string };
    expect(out.status).toBe('rejected');
    expect(seen).toHaveLength(1);
  });

  it('requires a reason in the body', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const { req, res, sent } = makeReqRes('POST', `/api/v1/proposals/${p.id}/reject`, '{}');
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    expect(sent().status).toBe(400);
  });
});

const POOLED: PoolEntry = {
  ollamaName: 'qwen2.5:32b',
  hfRepoId: 'Qwen/Qwen2.5-32B-GGUF',
  sizeOnDiskGb: 20,
  installedAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
  currentScore: 71,
};

function writeModelProposal(dir: string, id: string, status = 'open'): void {
  const record = {
    kind: 'model',
    id,
    createdAt: '2026-07-07T00:00:00.000Z',
    proposedBy: 'orchestrator:lmlm',
    status,
    source: { justification: 'A newer model beats the current pool member by a wide margin.' },
    model: {
      action: 'swap',
      target: { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b' },
      replaces: { ollamaName: 'qwen2.5:32b' },
      scoreDelta: 7.4,
      justification: {
        summary: 's',
        benchmarkBasis: ['b'],
        hardwareFit: '27GB',
        evidence: 'direct',
        freshness: '2026-05-21',
      },
      diskImpactGb: 3.2,
    },
  };
  const pdir = path.join(dir, '.harness', 'proposals');
  fs.mkdirSync(pdir, { recursive: true });
  fs.writeFileSync(path.join(pdir, `${id}.json`), JSON.stringify(record, null, 2));
}

function fakePool(opts: { install?: InstallPoolResult; evict?: EvictPoolResult }): {
  ops: ModelPoolOps;
  evictCalls: number;
  installCalls: number;
} {
  let evictCalls = 0;
  let installCalls = 0;
  const state: PoolState = {
    diskBudgetGb: 100,
    diskUsedGb: 20,
    entries: [POOLED],
    allowedOrgs: ['Qwen'],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
  const ops: ModelPoolOps = {
    install: () => {
      installCalls += 1;
      return Promise.resolve(opts.install ?? { status: 'success', entry: POOLED, evicted: [] });
    },
    evict: (r) => {
      evictCalls += 1;
      return Promise.resolve(
        opts.evict ?? { status: 'success', name: r.ollamaName, removed: POOLED }
      );
    },
    snapshot: () => state,
    markPendingEviction: () => {},
  };
  return {
    ops,
    get evictCalls() {
      return evictCalls;
    },
    get installCalls() {
      return installCalls;
    },
  };
}

describe('POST /api/v1/proposals/:id/approve (model kind)', () => {
  it('stale target (HF 404) → failed_target_missing, pool snapshot unchanged', async () => {
    writeModelProposal(tmpDir, 'proposal_model1');
    const pool = fakePool({
      install: { status: 'error', code: 'failed_target_missing', message: 'HF 404', evicted: [] },
    });
    const before = pool.ops.snapshot().entries.slice();
    const { req, res, sent } = makeReqRes('POST', '/api/v1/proposals/proposal_model1/approve');
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus, modelPool: pool.ops });
    await settle();

    expect(sent().status).toBe(200);
    const out = JSON.parse(sent().body) as { status: string };
    expect(out.status).toBe('failed_target_missing');
    // Persisted transition
    const stored = await getProposal(tmpDir, 'proposal_model1');
    expect(stored?.status).toBe('failed_target_missing');
    // Pool untouched
    expect(pool.evictCalls).toBe(0);
    expect(pool.ops.snapshot().entries).toEqual(before);
  });

  it('returns 501 when model handlers are not configured', async () => {
    writeModelProposal(tmpDir, 'proposal_model2');
    const { req, res, sent } = makeReqRes('POST', '/api/v1/proposals/proposal_model2/approve');
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    expect(sent().status).toBe(501);
  });

  it('already-approved proposal → 409, no second install/evict, no pool event', async () => {
    writeModelProposal(tmpDir, 'proposal_approved', 'approved');
    const pool = fakePool({});
    const poolEvents: unknown[] = [];
    bus.on('local-models:pool', (d) => poolEvents.push(d));
    const { req, res, sent } = makeReqRes('POST', '/api/v1/proposals/proposal_approved/approve');
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus, modelPool: pool.ops });
    await settle();

    expect(sent().status).toBe(409);
    expect(sent().body).toContain('already approved');
    // Terminal-state guard fires BEFORE dispatch: no install, no evict, no event.
    expect(pool.installCalls).toBe(0);
    expect(pool.evictCalls).toBe(0);
    expect(poolEvents).toHaveLength(0);
  });

  it('already-failed_target_missing proposal → 409, does not retry the stale target (D13)', async () => {
    writeModelProposal(tmpDir, 'proposal_stale', 'failed_target_missing');
    const pool = fakePool({});
    const proposalEvents: unknown[] = [];
    bus.on('local-models:proposal', (d) => proposalEvents.push(d));
    const { req, res, sent } = makeReqRes('POST', '/api/v1/proposals/proposal_stale/approve');
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus, modelPool: pool.ops });
    await settle();

    expect(sent().status).toBe(409);
    expect(sent().body).toContain('already failed_target_missing');
    // D13: no re-drive of install against the stale target, no duplicate events.
    expect(pool.installCalls).toBe(0);
    expect(pool.evictCalls).toBe(0);
    expect(proposalEvents).toHaveLength(0);
  });
});

describe('POST /api/v1/proposals/:id/reject (model kind)', () => {
  it('records a rejection decision on the model proposal', async () => {
    writeModelProposal(tmpDir, 'proposal_model3');
    const pool = fakePool({});
    const { req, res, sent } = makeReqRes(
      'POST',
      '/api/v1/proposals/proposal_model3/reject',
      JSON.stringify({ reason: 'operator prefers the current pool member' })
    );
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus, modelPool: pool.ops });
    await settle();

    expect(sent().status).toBe(200);
    const out = JSON.parse(sent().body) as { status: string; decision?: { action: string } };
    expect(out.status).toBe('rejected');
    expect(out.decision?.action).toBe('rejected');
    const stored = await getProposal(tmpDir, 'proposal_model3');
    expect(stored?.status).toBe('rejected');
  });
});

describe('PATCH /api/v1/proposals/:id', () => {
  it('edits content and resets gate to not-run', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    await runGate(tmpDir, p.id);
    const { req, res, sent } = makeReqRes(
      'PATCH',
      `/api/v1/proposals/${p.id}`,
      JSON.stringify({
        content: { description: 'A revised description that is now significantly different.' },
      })
    );
    handleV1ProposalsRoute(req, res, { projectPath: tmpDir, bus });
    await settle();
    expect(sent().status).toBe(200);
    const updated = JSON.parse(sent().body) as { status: string; gate?: { lastRunAt?: string } };
    expect(updated.status).toBe('open');
    expect(updated.gate?.lastRunAt).toBeUndefined();
  });
});
