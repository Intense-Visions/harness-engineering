import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createProposal } from '@harness-engineering/core';
import { handleV1ProposalsRoute } from './proposals';
import { runGate } from '../../../proposals/gate';

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
