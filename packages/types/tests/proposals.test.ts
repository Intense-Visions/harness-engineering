import { describe, it, expect } from 'vitest';
import {
  SkillProposalSchema,
  EmitSkillProposalInputSchema,
  SkillProvenanceSchema,
  ProposalKindSchema,
  ProposalStatusSchema,
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

describe('SkillProvenanceSchema', () => {
  it.each(['community', 'agent-proposed', 'user-authored'] as const)('accepts %s', (v) => {
    expect(SkillProvenanceSchema.safeParse(v).success).toBe(true);
  });
  it('rejects unknown values', () => {
    expect(SkillProvenanceSchema.safeParse('ai-assisted').success).toBe(false);
  });
});

describe('ProposalKindSchema', () => {
  it('accepts the two kinds', () => {
    expect(ProposalKindSchema.safeParse('new-skill').success).toBe(true);
    expect(ProposalKindSchema.safeParse('refinement').success).toBe(true);
  });
});

describe('ProposalStatusSchema', () => {
  it('covers the lifecycle', () => {
    for (const s of ['open', 'gate-running', 'gate-failed', 'approved', 'rejected']) {
      expect(ProposalStatusSchema.safeParse(s).success).toBe(true);
    }
  });
});

describe('SkillProposalSchema — new-skill', () => {
  it('accepts a valid new-skill proposal', () => {
    expect(SkillProposalSchema.safeParse(VALID_NEW_SKILL).success).toBe(true);
  });

  it('rejects when skillYaml is missing', () => {
    const { ...bad } = VALID_NEW_SKILL;
    const r = SkillProposalSchema.safeParse({
      ...bad,
      content: { name: bad.content.name, description: bad.content.description, skillMd: 'x' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects when targetSkill is set on new-skill', () => {
    const r = SkillProposalSchema.safeParse({
      ...VALID_NEW_SKILL,
      targetSkill: 'something',
    });
    expect(r.success).toBe(false);
  });
});

describe('SkillProposalSchema — refinement', () => {
  it('accepts a valid refinement proposal', () => {
    expect(SkillProposalSchema.safeParse(VALID_REFINEMENT).success).toBe(true);
  });

  it('rejects when targetSkill is missing', () => {
    const { targetSkill: _omit, ...bad } = VALID_REFINEMENT;
    void _omit;
    expect(SkillProposalSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects when diff is missing', () => {
    const r = SkillProposalSchema.safeParse({
      ...VALID_REFINEMENT,
      content: {
        name: VALID_REFINEMENT.content.name,
        description: VALID_REFINEMENT.content.description,
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejects when skillYaml is set on refinement', () => {
    const r = SkillProposalSchema.safeParse({
      ...VALID_REFINEMENT,
      content: { ...VALID_REFINEMENT.content, skillYaml: 'name: x\n' },
    });
    expect(r.success).toBe(false);
  });
});

describe('EmitSkillProposalInputSchema', () => {
  it('parses a valid new-skill input', () => {
    const r = EmitSkillProposalInputSchema.safeParse({
      kind: 'new-skill',
      proposedBy: 'agent-id',
      justification: VALID_NEW_SKILL.source.justification,
      content: VALID_NEW_SKILL.content,
    });
    expect(r.success).toBe(true);
  });

  it('rejects short justification', () => {
    const r = EmitSkillProposalInputSchema.safeParse({
      kind: 'new-skill',
      proposedBy: 'agent-id',
      justification: 'short',
      content: VALID_NEW_SKILL.content,
    });
    expect(r.success).toBe(false);
  });
});
