import { describe, it, expect } from 'vitest';
import {
  ProposalSchema,
  ProposalTypeSchema,
  SkillKindSchema,
  migrateProposalRecord,
  ModelProposalContentSchema,
} from '../src/proposals';

const VALID_NEW_SKILL = {
  id: 'proposal_1',
  createdAt: '2026-05-17T00:00:00.000Z',
  kind: 'new-skill' as const,
  proposedBy: 'claude-code:harness-execution',
  source: {
    justification:
      'After three sessions of repetitive search-and-edit work, this skill would automate the pattern.',
  },
  content: {
    name: 'auto-rename-helpers',
    description: 'Renames helper modules across a workspace with import-path rewriting.',
    skillYaml: 'name: auto-rename-helpers\nversion: "0.1.0"\n',
    skillMd: '# Auto Rename Helpers\n',
  },
  status: 'open' as const,
};

const VALID_REFINEMENT = {
  id: 'proposal_2',
  createdAt: '2026-05-17T00:00:00.000Z',
  kind: 'refinement' as const,
  targetSkill: 'auto-rename-helpers',
  proposedBy: 'claude-code:harness-refactoring',
  source: {
    justification:
      'Existing skill misses the case where re-exports live in a separate barrel; adds a phase.',
  },
  content: {
    name: 'auto-rename-helpers',
    description: 'Adds a barrel-rewrite phase to the auto-rename-helpers skill.',
    diff: '--- a/SKILL.md\n+++ b/SKILL.md\n@@\n+## Barrel rewrites\n',
  },
  status: 'open' as const,
};

describe('read-migration (legacy → discriminated)', () => {
  it('migrates a legacy top-level kind into { kind:"skill", skillKind }', () => {
    const migrated = migrateProposalRecord({ ...VALID_NEW_SKILL }) as Record<string, unknown>;
    expect(migrated['kind']).toBe('skill');
    expect(migrated['skillKind']).toBe('new-skill');
    expect(ProposalSchema.safeParse(VALID_NEW_SKILL).success).toBe(true); // legacy round-trips
  });
  it('leaves an already-generalized skill record untouched', () => {
    const modern = { ...VALID_REFINEMENT, kind: 'skill', skillKind: 'refinement' as const };
    expect(ProposalSchema.safeParse(modern).success).toBe(true);
  });
  it('accepts a model proposal via the union', () => {
    const model = {
      id: 'proposal_m1',
      createdAt: '2026-07-07T00:00:00.000Z',
      kind: 'model' as const,
      proposedBy: 'orchestrator:lmlm',
      status: 'open' as const,
      source: { justification: 'A newer model beats the current pool member by a wide margin.' },
      model: {
        action: 'swap' as const,
        target: { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b' },
        replaces: { ollamaName: 'qwen2.5:32b' },
        scoreDelta: 7.4,
        justification: {
          summary: 's',
          benchmarkBasis: ['LiveBench 78 vs 71'],
          hardwareFit: '27GB',
          evidence: 'direct',
          freshness: '2026-05-21',
        },
        diskImpactGb: 3.2,
      },
    };
    expect(ProposalSchema.safeParse(model).success).toBe(true);
    expect(ModelProposalContentSchema.safeParse(model.model).success).toBe(true);
  });

  it('T6: accepts and round-trips an optional absolute targetScore', () => {
    const withScore = {
      action: 'add' as const,
      target: { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b' },
      scoreDelta: 81.5,
      targetScore: 81.5,
      justification: {
        summary: 's',
        benchmarkBasis: [],
        hardwareFit: '27GB',
        evidence: 'direct',
        freshness: '2026-05-21',
      },
      diskImpactGb: 3.2,
    };
    const parsed = ModelProposalContentSchema.safeParse(withScore);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.targetScore).toBe(81.5);
  });

  it('T6: targetScore is optional — legacy proposals without it still parse', () => {
    const legacy = {
      action: 'swap' as const,
      target: { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b' },
      replaces: { ollamaName: 'qwen2.5:32b' },
      scoreDelta: 7.4,
      justification: {
        summary: 's',
        benchmarkBasis: [],
        hardwareFit: '27GB',
        evidence: 'direct',
        freshness: '2026-05-21',
      },
      diskImpactGb: 3.2,
    };
    const parsed = ModelProposalContentSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.targetScore).toBeUndefined();
  });
});

describe('ProposalTypeSchema', () => {
  it('is the outer discriminator', () => {
    expect(ProposalTypeSchema.safeParse('skill').success).toBe(true);
    expect(ProposalTypeSchema.safeParse('model').success).toBe(true);
    expect(ProposalTypeSchema.safeParse('new-skill').success).toBe(false);
  });
});

describe('SkillKindSchema', () => {
  it('retains the skill-change enum values', () => {
    expect(SkillKindSchema.safeParse('new-skill').success).toBe(true);
    expect(SkillKindSchema.safeParse('refinement').success).toBe(true);
    expect(SkillKindSchema.safeParse('model').success).toBe(false);
  });
});
