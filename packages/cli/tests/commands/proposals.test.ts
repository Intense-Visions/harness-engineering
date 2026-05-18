import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createProposal } from '@harness-engineering/core';
import {
  runProposalsList,
  runProposalsShow,
  runProposalsReject,
} from '../../src/commands/proposals';

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

// Silence unused-import warning for vi (kept for future test growth)
void vi;
