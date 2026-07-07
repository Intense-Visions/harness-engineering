import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createProposal,
  createModelProposal,
  getProposal,
  listProposals,
  updateProposal,
  ProposalNotFoundError,
  ProposalConflictError,
} from '../../src/proposals/store';
import type { ModelProposalContent } from '@harness-engineering/types';

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
    expect(p.skillKind).toBe('new-skill');
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
      skillKind: 'refinement',
    });
  });
});

const MODEL_CONTENT: ModelProposalContent = {
  action: 'swap',
  target: { hfRepoId: 'org/next-14b-gguf', ollamaName: 'next:14b' },
  replaces: { ollamaName: 'qwen3:8b' },
  scoreDelta: 15,
  justification: {
    summary: 'Swap qwen3:8b for the higher-scoring next:14b given the current hardware fit.',
    benchmarkBasis: ['mmlu', 'gsm8k'],
    hardwareFit: 'Fits within the 24GB VRAM budget with headroom.',
    evidence: 'Frozen snapshot rank places next:14b above qwen3:8b for this profile.',
    freshness: 'Snapshot dated 2026-07-01.',
  },
  diskImpactGb: 9.2,
};

describe('createModelProposal', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists a kind=model record retrievable by listProposals kind filter', async () => {
    const rec = await createModelProposal(tmpDir, MODEL_CONTENT);
    expect(rec.id).toMatch(/^proposal_[a-f0-9]+$/);
    expect(rec.kind).toBe('model');
    expect(rec.status).toBe('open');
    expect(rec.model.target.ollamaName).toBe('next:14b');

    const models = await listProposals(tmpDir, { kind: 'model' });
    expect(models).toHaveLength(1);
    expect(models[0]!.kind).toBe('model');
    expect((models[0] as typeof rec).model.target.ollamaName).toBe('next:14b');

    const file = path.join(tmpDir, '.harness', 'proposals', `${rec.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
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

  it('read-migrates a legacy on-disk record into the discriminated shape (N3)', async () => {
    // A pre-generalization record: top-level `kind` held the skill-change value,
    // there is no outer `kind:'skill'` and no `skillKind`.
    const legacy = {
      id: 'proposal_legacy',
      createdAt: '2026-05-01T00:00:00.000Z',
      kind: 'new-skill',
      proposedBy: 'x',
      source: { justification: '20+ character justification string here.' },
      content: {
        name: 'legacy-skill',
        description: 'A twenty-plus character description string.',
        skillYaml: 'name: legacy-skill\n',
        skillMd: '# Legacy\n',
      },
      status: 'open',
    };
    const dir = path.join(tmpDir, '.harness', 'proposals');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'proposal_legacy.json'), JSON.stringify(legacy, null, 2));

    const migrated = await getProposal(tmpDir, 'proposal_legacy');
    expect(migrated?.kind).toBe('skill');
    expect((migrated as { skillKind?: string })?.skillKind).toBe('new-skill');
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
      skillKind: 'refinement',
      status: 'gate-running',
    });
    expect(updated.id).toBe(p.id);
    expect(updated.createdAt).toBe(p.createdAt);
    expect(updated.skillKind).toBe('new-skill');
    expect(updated.status).toBe('gate-running');
  });
});
