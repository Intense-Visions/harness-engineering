import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createProposal } from '@harness-engineering/core';
import { runProposalsStatus, actStatusCommand } from '../../src/commands/proposals';

const SKILL_INPUT = {
  kind: 'new-skill' as const,
  proposedBy: 'claude-code:harness-execution',
  justification: 'Recurring pattern across three sessions justifies a shared skill.',
  content: {
    name: 'auto-rename-helpers',
    description: 'Renames helper modules with import-path rewriting.',
    skillYaml: 'name: auto-rename-helpers\nversion: "0.1.0"\n',
    skillMd: '# Auto Rename Helpers\n',
  },
};

describe('runProposalsStatus — queue tallying', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-status-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('reports total=0 on an empty/absent store without throwing', async () => {
    const r = await runProposalsStatus({}, tmp);
    expect(r.queue.total).toBe(0);
    expect(r.queue).toMatchObject({
      open: 0,
      gateRunning: 0,
      gateFailed: 0,
      approved: 0,
      rejected: 0,
    });
    expect(r.emitters.manualEmit).toEqual({
      surface: 'emit_skill_proposal',
      available: true,
    });
  });

  it('tallies open and rejected proposals by status', async () => {
    await createProposal(tmp, SKILL_INPUT);
    const p2 = await createProposal(tmp, {
      ...SKILL_INPUT,
      content: { ...SKILL_INPUT.content, name: 'second-skill' },
    });
    const { updateProposal } = await import('@harness-engineering/core');
    await updateProposal(tmp, p2.id, {
      status: 'rejected',
      decision: {
        decidedAt: new Date().toISOString(),
        decidedBy: 't',
        action: 'rejected',
        reason: 'dup',
      },
    });
    const r = await runProposalsStatus({}, tmp);
    expect(r.queue.total).toBe(2);
    expect(r.queue.open).toBe(1);
    expect(r.queue.rejected).toBe(1);
  });
});

describe('runProposalsStatus — enablement matrix (flag × provider)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-status-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('flag unset + no provider → dormant, reason names the flag', async () => {
    const r = await runProposalsStatus({}, tmp);
    const rp = r.emitters.retrospection;
    expect(rp).toMatchObject({ enabled: false, envFlagSet: false, providerResolvable: false });
    expect(rp.dormantReason).toContain('HARNESS_SESSION_RETROSPECTION');
  });

  it('flag set + no provider → dormant, reason names the provider', async () => {
    const r = await runProposalsStatus({ HARNESS_SESSION_RETROSPECTION: '1' }, tmp);
    const rp = r.emitters.retrospection;
    expect(rp).toMatchObject({ enabled: false, envFlagSet: true, providerResolvable: false });
    expect(rp.dormantReason).toMatch(/ANTHROPIC_API_KEY|HARNESS_ANALYSIS_BASE_URL|provider/);
  });

  it('flag unset + provider present → dormant, reason names the flag', async () => {
    const r = await runProposalsStatus({ ANTHROPIC_API_KEY: 'x' }, tmp);
    const rp = r.emitters.retrospection;
    expect(rp).toMatchObject({ enabled: false, envFlagSet: false, providerResolvable: true });
    expect(rp.dormantReason).toContain('HARNESS_SESSION_RETROSPECTION');
  });

  it('flag set + ANTHROPIC_API_KEY → enabled, no dormantReason', async () => {
    const r = await runProposalsStatus(
      { HARNESS_SESSION_RETROSPECTION: 'true', ANTHROPIC_API_KEY: 'x' },
      tmp
    );
    const rp = r.emitters.retrospection;
    expect(rp).toMatchObject({ enabled: true, envFlagSet: true, providerResolvable: true });
    expect(rp.dormantReason).toBeUndefined();
  });

  it('flag set + HARNESS_ANALYSIS_BASE_URL (local) → enabled via precedence', async () => {
    const r = await runProposalsStatus(
      {
        HARNESS_SESSION_RETROSPECTION: 'on',
        HARNESS_ANALYSIS_BASE_URL: 'http://127.0.0.1:11434/v1',
      },
      tmp
    );
    expect(r.emitters.retrospection.enabled).toBe(true);
    expect(r.emitters.retrospection.providerResolvable).toBe(true);
  });
});

describe('proposals status action', () => {
  const ORIG = process.env['HARNESS_PROJECT_ROOT'];
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-status-act-'));
    process.env['HARNESS_PROJECT_ROOT'] = tmp;
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (ORIG !== undefined) process.env['HARNESS_PROJECT_ROOT'] = ORIG;
    else delete process.env['HARNESS_PROJECT_ROOT'];
    vi.restoreAllMocks();
  });

  it('--json prints a valid ProposalsStatusReport and exits 0', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.exitCode = 0;
    await actStatusCommand({ json: true });
    const printed = spy.mock.calls.map((c) => String(c[0])).join('\n');
    const parsed = JSON.parse(printed);
    expect(parsed.queue.total).toBe(0);
    expect(parsed.emitters.manualEmit.available).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it('default (table) renders the dormant reason and exits 0', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const origFlag = process.env['HARNESS_SESSION_RETROSPECTION'];
    delete process.env['HARNESS_SESSION_RETROSPECTION'];
    process.exitCode = 0;
    try {
      await actStatusCommand({});
    } finally {
      if (origFlag !== undefined) process.env['HARNESS_SESSION_RETROSPECTION'] = origFlag;
    }
    const printed = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('retrospection: dormant');
    expect(printed).toContain('flag unset');
    expect(printed).toContain('reason: HARNESS_SESSION_RETROSPECTION is not set');
    expect(process.exitCode).toBe(0);
  });
});
