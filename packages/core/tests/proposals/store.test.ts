import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createProposal,
  getProposal,
  listProposals,
  updateProposal,
  ProposalNotFoundError,
  ProposalConflictError,
} from '../../src/proposals/store';

const tmpDir = path.join(__dirname, '__proposals_tmp__');

const NEW_SKILL_INPUT = {
  kind: 'new-skill' as const,
  proposedBy: 'claude-code:harness-execution',
  justification:
    'After three recurring sessions, this skill would automate a repeated migration pattern that is otherwise lost.',
  content: {
    name: 'auto-rename-helpers',
    description: 'Renames helper modules with import-path rewriting workspace-wide.',
    skillYaml: 'name: auto-rename-helpers\nversion: "0.1.0"\n',
    skillMd: '# Auto Rename Helpers\n',
  },
};

const REFINEMENT_INPUT = {
  kind: 'refinement' as const,
  targetSkill: 'auto-rename-helpers',
  proposedBy: 'claude-code:harness-refactoring',
  justification:
    'The existing skill misses the case where re-exports live in a separate barrel; add a phase.',
  content: {
    name: 'auto-rename-helpers',
    description: 'Adds a barrel-rewrite phase to the auto-rename-helpers skill.',
    diff: '--- a/SKILL.md\n+++ b/SKILL.md\n@@\n+## Barrel rewrites\n',
  },
};

describe('createProposal', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a proposal file with status=open', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    expect(p.id).toMatch(/^proposal_[a-f0-9]+$/);
    expect(p.status).toBe('open');
    expect(p.kind).toBe('new-skill');
    const file = path.join(tmpDir, '.harness', 'proposals', `${p.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('rejects a refinement that collides with an open refinement', async () => {
    await createProposal(tmpDir, REFINEMENT_INPUT);
    await expect(createProposal(tmpDir, REFINEMENT_INPUT)).rejects.toBeInstanceOf(
      ProposalConflictError
    );
  });

  it('allows a refinement once the prior one is rejected', async () => {
    const first = await createProposal(tmpDir, REFINEMENT_INPUT);
    await updateProposal(tmpDir, first.id, {
      status: 'rejected',
      decision: {
        decidedAt: new Date().toISOString(),
        decidedBy: 'tester',
        action: 'rejected',
        reason: 'duplicate',
      },
    });
    await expect(createProposal(tmpDir, REFINEMENT_INPUT)).resolves.toMatchObject({
      kind: 'refinement',
    });
  });
});

describe('getProposal / listProposals', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for unknown id', async () => {
    expect(await getProposal(tmpDir, 'proposal_zzzzz')).toBeNull();
  });

  it('lists newest-first and filters by status', async () => {
    const a = await createProposal(tmpDir, NEW_SKILL_INPUT);
    await new Promise((r) => setTimeout(r, 4));
    const b = await createProposal(tmpDir, {
      ...NEW_SKILL_INPUT,
      content: { ...NEW_SKILL_INPUT.content, name: 'another-helper' },
    });
    const all = await listProposals(tmpDir);
    expect(all.map((p) => p.id)).toEqual([b.id, a.id]);

    await updateProposal(tmpDir, a.id, {
      status: 'rejected',
      decision: {
        decidedAt: new Date().toISOString(),
        decidedBy: 'tester',
        action: 'rejected',
      },
    });
    const open = await listProposals(tmpDir, { status: 'open' });
    expect(open.map((p) => p.id)).toEqual([b.id]);
  });
});

describe('updateProposal', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws ProposalNotFoundError for unknown id', async () => {
    await expect(updateProposal(tmpDir, 'proposal_missing', {})).rejects.toBeInstanceOf(
      ProposalNotFoundError
    );
  });

  it('preserves id, createdAt, and kind even if patch tries to change them', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const updated = await updateProposal(tmpDir, p.id, {
      // @ts-expect-error — intentionally exercising the immutable guard
      id: 'proposal_other',
      // @ts-expect-error — intentionally exercising the immutable guard
      createdAt: '1999-01-01T00:00:00.000Z',
      // @ts-expect-error — intentionally exercising the immutable guard
      kind: 'refinement',
      status: 'gate-running',
    });
    expect(updated.id).toBe(p.id);
    expect(updated.createdAt).toBe(p.createdAt);
    expect(updated.kind).toBe('new-skill');
    expect(updated.status).toBe('gate-running');
  });
});
