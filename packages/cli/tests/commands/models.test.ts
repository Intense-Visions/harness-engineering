import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createProposal } from '@harness-engineering/core';
import {
  runModelsProposals,
  runModelsReject,
  runModelsApprove,
  runModelsRefresh,
  refreshExitCode,
} from '../../src/commands/models';
import { ExitCode } from '../../src/utils/errors';

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

describe('harness models proposals (disk-backed)', () => {
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
});

describe('harness models approve/reject (HTTP round-trip)', () => {
  afterEach(() => {
    if (ORIG_TOKEN !== undefined) process.env['HARNESS_ADMIN_TOKEN'] = ORIG_TOKEN;
    else delete process.env['HARNESS_ADMIN_TOKEN'];
    if (ORIG_URL !== undefined) process.env['HARNESS_ORCHESTRATOR_URL'] = ORIG_URL;
    else delete process.env['HARNESS_ORCHESTRATOR_URL'];
    vi.restoreAllMocks();
  });

  it('reject POSTs to the kind-aware reject route with reason + bearer token', async () => {
    process.env['HARNESS_ADMIN_TOKEN'] = 'secret-token';
    process.env['HARNESS_ORCHESTRATOR_URL'] = 'http://127.0.0.1:9999';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"status":"rejected"}', { status: 200 }));

    const result = await runModelsReject('proposal_modelR', 'operator prefers current');

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:9999/api/v1/proposals/proposal_modelR/reject');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer secret-token' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      reason: 'operator prefers current',
    });
  });

  it('reject surfaces the route 409 (terminal-state guard) instead of writing the store', async () => {
    process.env['HARNESS_ADMIN_TOKEN'] = 'secret-token';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{"error":"proposal already approved; cannot reject"}', { status: 409 })
      );

    const result = await runModelsReject('proposal_already', 'too late');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('reject fails without HARNESS_ADMIN_TOKEN and does not call fetch', async () => {
    delete process.env['HARNESS_ADMIN_TOKEN'];
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await runModelsReject('proposal_notoken', 'no reason');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HARNESS_ADMIN_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
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

describe('harness models refresh (O4 exit semantics)', () => {
  afterEach(() => {
    if (ORIG_TOKEN !== undefined) process.env['HARNESS_ADMIN_TOKEN'] = ORIG_TOKEN;
    else delete process.env['HARNESS_ADMIN_TOKEN'];
    if (ORIG_URL !== undefined) process.env['HARNESS_ORCHESTRATOR_URL'] = ORIG_URL;
    else delete process.env['HARNESS_ORCHESTRATOR_URL'];
    vi.restoreAllMocks();
  });

  it('200 (HF down but snapshot loaded → soft warning) → ok, exit 0', async () => {
    process.env['HARNESS_ADMIN_TOKEN'] = 'secret-token';
    process.env['HARNESS_ORCHESTRATOR_URL'] = 'http://127.0.0.1:9999';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ emitted: 1, warnings: ['HuggingFace popularity probe failed'] }),
          { status: 200 }
        )
      );

    const result = await runModelsRefresh();

    expect(result.ok).toBe(true);
    expect(result.emitted).toBe(1);
    expect(result.warnings).toEqual(['HuggingFace popularity probe failed']);
    expect(refreshExitCode(result)).toBe(ExitCode.SUCCESS);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:9999/api/v1/local-models/refresh');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer secret-token' });
  });

  it('503 (HF unreachable AND no snapshot → hard failure) → not ok, exit non-zero', async () => {
    process.env['HARNESS_ADMIN_TOKEN'] = 'secret-token';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'refresh hard failure: HuggingFace unreachable and no benchmark snapshot loaded',
        }),
        { status: 503 }
      )
    );

    const result = await runModelsRefresh();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.error).toMatch(/hard failure/);
    expect(refreshExitCode(result)).toBe(ExitCode.ERROR);
    expect(refreshExitCode(result)).not.toBe(0);
  });

  it('fails without HARNESS_ADMIN_TOKEN and does not call fetch', async () => {
    delete process.env['HARNESS_ADMIN_TOKEN'];
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await runModelsRefresh();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HARNESS_ADMIN_TOKEN/);
    expect(refreshExitCode(result)).toBe(ExitCode.ERROR);
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
