import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createProposal, updateProposal } from '@harness-engineering/core';
import {
  runProposalsList,
  runProposalsShow,
  runProposalsReject,
  runProposalsStatus,
} from '../../src/commands/proposals';
import { envEnabled } from '../../src/mcp/tools/state';

const ORIG_CWD = process.cwd();
const ORIG_PROJECT_ROOT = process.env['HARNESS_PROJECT_ROOT'];

const NEW_SKILL_INPUT = {
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

describe('harness proposals subcommand (disk-backed paths)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-proposals-cli-'));
    process.env['HARNESS_PROJECT_ROOT'] = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (ORIG_PROJECT_ROOT !== undefined) process.env['HARNESS_PROJECT_ROOT'] = ORIG_PROJECT_ROOT;
    else delete process.env['HARNESS_PROJECT_ROOT'];
    process.chdir(ORIG_CWD);
  });

  it('list returns a summary of open proposals', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const summaries = await runProposalsList('open');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: p.id,
      kind: 'new-skill',
      name: NEW_SKILL_INPUT.content.name,
      status: 'open',
    });
  });

  it('list with status=all returns proposals in any state', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    await runProposalsReject(p.id, 'duplicate idea');
    const all = await runProposalsList('all');
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: 'rejected' });
  });

  it('show returns the full proposal', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const got = await runProposalsShow(p.id);
    expect(got?.id).toBe(p.id);
    expect(got?.content.skillYaml).toBe(NEW_SKILL_INPUT.content.skillYaml);
  });

  it('show returns null for unknown id', async () => {
    expect(await runProposalsShow('proposal_missing')).toBeNull();
  });

  it('reject writes decision metadata and transitions status', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const updated = await runProposalsReject(p.id, 'duplicate of existing skill');
    expect(updated.status).toBe('rejected');
    expect(updated.decision?.action).toBe('rejected');
    expect(updated.decision?.reason).toBe('duplicate of existing skill');
  });
});

describe('runProposalsList — status filtering', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-proposals-cli-'));
    process.env['HARNESS_PROJECT_ROOT'] = tmpDir;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (ORIG_PROJECT_ROOT !== undefined) process.env['HARNESS_PROJECT_ROOT'] = ORIG_PROJECT_ROOT;
    else delete process.env['HARNESS_PROJECT_ROOT'];
  });

  it('omits proposals outside the requested status', async () => {
    const p1 = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const p2 = await createProposal(tmpDir, {
      ...NEW_SKILL_INPUT,
      content: { ...NEW_SKILL_INPUT.content, name: 'second-skill' },
    });
    void p1;
    await runProposalsReject(p2.id, 'no');
    const open = await runProposalsList('open');
    expect(open.map((s) => s['id'])).toEqual([p1.id]);
  });
});

describe('runProposalsStatus — queue tallying', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-proposals-status-'));
    process.env['HARNESS_PROJECT_ROOT'] = tmpDir;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (ORIG_PROJECT_ROOT !== undefined) process.env['HARNESS_PROJECT_ROOT'] = ORIG_PROJECT_ROOT;
    else delete process.env['HARNESS_PROJECT_ROOT'];
  });

  const mkOpen = (name: string) =>
    createProposal(tmpDir, {
      ...NEW_SKILL_INPUT,
      content: { ...NEW_SKILL_INPUT.content, name },
    });

  it('tallies counts by status and total across a mixed queue', async () => {
    const open1 = await mkOpen('skill-open-1');
    void open1;
    await mkOpen('skill-open-2');
    const toReject = await mkOpen('skill-reject');
    await runProposalsReject(toReject.id, 'duplicate');
    const toApprove = await mkOpen('skill-approve');
    await updateProposal(tmpDir, toApprove.id, { status: 'approved' });
    const gateRunning = await mkOpen('skill-gate-running');
    await updateProposal(tmpDir, gateRunning.id, { status: 'gate-running' });
    const gateFailed = await mkOpen('skill-gate-failed');
    await updateProposal(tmpDir, gateFailed.id, { status: 'gate-failed' });

    const report = await runProposalsStatus(process.env, tmpDir);
    expect(report.queue).toEqual({
      open: 2,
      gateRunning: 1,
      gateFailed: 1,
      approved: 1,
      rejected: 1,
      total: 6,
    });
  });

  it('reports all zeros when the proposals dir is absent', async () => {
    const report = await runProposalsStatus(process.env, tmpDir);
    expect(report.queue).toEqual({
      open: 0,
      gateRunning: 0,
      gateFailed: 0,
      approved: 0,
      rejected: 0,
      total: 0,
    });
  });
});

describe('runProposalsStatus — retrospection enablement matrix', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-proposals-enable-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Hermetic: every case passes an explicit env object; real process.env is untouched.
  it('flag off + provider off → dormant, reason names the flag', async () => {
    const report = await runProposalsStatus({}, tmpDir);
    const r = report.emitters.retrospection;
    expect(r.enabled).toBe(false);
    expect(r.envFlagSet).toBe(false);
    expect(r.providerResolvable).toBe(false);
    expect(r.dormantReason).toContain('HARNESS_SESSION_RETROSPECTION');
  });

  it.each(['true', '1', 'yes', 'on'])(
    'flag on via %s + provider off → dormant, reason names the provider',
    async (flag) => {
      const report = await runProposalsStatus({ HARNESS_SESSION_RETROSPECTION: flag }, tmpDir);
      const r = report.emitters.retrospection;
      expect(r.envFlagSet).toBe(true);
      expect(r.providerResolvable).toBe(false);
      expect(r.enabled).toBe(false);
      expect(r.dormantReason).toContain('provider');
    }
  );

  it('flag off + ANTHROPIC_API_KEY set → dormant', async () => {
    const report = await runProposalsStatus({ ANTHROPIC_API_KEY: 'sk-test' }, tmpDir);
    const r = report.emitters.retrospection;
    expect(r.envFlagSet).toBe(false);
    expect(r.providerResolvable).toBe(true);
    expect(r.enabled).toBe(false);
    expect(r.dormantReason).toContain('HARNESS_SESSION_RETROSPECTION');
  });

  it('flag on + ANTHROPIC_API_KEY → enabled, no dormantReason', async () => {
    const report = await runProposalsStatus(
      { HARNESS_SESSION_RETROSPECTION: '1', ANTHROPIC_API_KEY: 'sk-test' },
      tmpDir
    );
    const r = report.emitters.retrospection;
    expect(r.enabled).toBe(true);
    expect(r.dormantReason).toBeUndefined();
  });

  it('flag on + HARNESS_ANALYSIS_BASE_URL → enabled', async () => {
    const report = await runProposalsStatus(
      {
        HARNESS_SESSION_RETROSPECTION: 'true',
        HARNESS_ANALYSIS_BASE_URL: 'http://127.0.0.1:11434/v1',
      },
      tmpDir
    );
    const r = report.emitters.retrospection;
    expect(r.enabled).toBe(true);
    expect(r.providerResolvable).toBe(true);
    expect(r.dormantReason).toBeUndefined();
  });

  it('manualEmit surface is always available', async () => {
    const report = await runProposalsStatus({}, tmpDir);
    expect(report.emitters.manualEmit).toEqual({
      surface: 'emit_skill_proposal',
      available: true,
    });
  });
});

describe('envEnabled predicate', () => {
  it.each(['1', 'true', 'YES', 'on', ' True '])('is true for %j', (v) => {
    expect(envEnabled(v)).toBe(true);
  });
  it.each([undefined, '', '0', 'no', 'off'])('is false for %j', (v) => {
    expect(envEnabled(v)).toBe(false);
  });
});

// Silence unused-import warning for vi (kept for future test growth)
void vi;
