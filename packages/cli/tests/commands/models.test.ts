import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createProposal } from '@harness-engineering/core';
import { runModelsProposals, runModelsReject, runModelsApprove } from '../../src/commands/models';

const ORIG_PROJECT_ROOT = process.env['HARNESS_PROJECT_ROOT'];
const ORIG_TOKEN = process.env['HARNESS_ADMIN_TOKEN'];
const ORIG_URL = process.env['HARNESS_ORCHESTRATOR_URL'];

const SKILL_INPUT = {
  kind: 'new-skill' as const,
  proposedBy: 'claude-code:harness-execution',
  justification:
    'Recurring pattern observed across three sessions justifies promotion to a shared skill.',
  content: {
    name: 'auto-rename-helpers',
    description: 'Renames helper modules with import-path rewriting.',
    skillYaml: 'name: auto-rename-helpers\nversion: "0.1.0"\n',
    skillMd: '# Auto Rename Helpers\n',
  },
};

function writeModelProposal(dir: string, id: string): void {
  const record = {
    kind: 'model',
    id,
    createdAt: '2026-07-07T00:00:00.000Z',
    proposedBy: 'orchestrator:lmlm',
    status: 'open',
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

describe('harness models proposals/reject (disk-backed)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-models-cli-'));
    process.env['HARNESS_PROJECT_ROOT'] = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (ORIG_PROJECT_ROOT !== undefined) process.env['HARNESS_PROJECT_ROOT'] = ORIG_PROJECT_ROOT;
    else delete process.env['HARNESS_PROJECT_ROOT'];
  });

  it('proposals lists only model-kind proposals (filters out skill proposals)', async () => {
    await createProposal(tmpDir, SKILL_INPUT);
    writeModelProposal(tmpDir, 'proposal_model1');

    const rows = await runModelsProposals('open');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'proposal_model1',
      kind: 'model',
      action: 'swap',
      target: 'qwen3:32b',
      replaces: 'qwen2.5:32b',
    });
  });

  it('reject records a rejected decision (F7 feeder) and transitions status', async () => {
    writeModelProposal(tmpDir, 'proposal_model2');
    const updated = await runModelsReject('proposal_model2', 'operator prefers current');
    expect(updated.status).toBe('rejected');
    expect(updated.decision?.action).toBe('rejected');
    expect(updated.decision?.reason).toBe('operator prefers current');
  });
});

describe('harness models approve (HTTP round-trip)', () => {
  afterEach(() => {
    if (ORIG_TOKEN !== undefined) process.env['HARNESS_ADMIN_TOKEN'] = ORIG_TOKEN;
    else delete process.env['HARNESS_ADMIN_TOKEN'];
    if (ORIG_URL !== undefined) process.env['HARNESS_ORCHESTRATOR_URL'] = ORIG_URL;
    else delete process.env['HARNESS_ORCHESTRATOR_URL'];
    vi.restoreAllMocks();
  });

  it('POSTs to the kind-aware approve route with a bearer token', async () => {
    process.env['HARNESS_ADMIN_TOKEN'] = 'secret-token';
    process.env['HARNESS_ORCHESTRATOR_URL'] = 'http://127.0.0.1:9999';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"status":"approved"}', { status: 200 }));

    const result = await runModelsApprove('proposal_model3');

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:9999/api/v1/proposals/proposal_model3/approve');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer secret-token' });
  });

  it('fails without HARNESS_ADMIN_TOKEN and does not call fetch', async () => {
    delete process.env['HARNESS_ADMIN_TOKEN'];
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await runModelsApprove('proposal_model4');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HARNESS_ADMIN_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('models command dependency hygiene', () => {
  it('does not import the local-models workspace package', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'commands', 'models.ts'),
      'utf8'
    );
    expect(src).not.toContain('@harness-engineering/local-models');
  });
});
