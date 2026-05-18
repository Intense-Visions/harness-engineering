import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  emitSkillProposalDefinition,
  handleEmitSkillProposal,
} from '../../../src/mcp/tools/skill-proposal';

const NEW_SKILL_INPUT = {
  kind: 'new-skill' as const,
  proposedBy: 'claude-code:harness-execution',
  justification:
    'After three sessions of repetitive search-and-edit work, this skill would automate the pattern.',
  content: {
    name: 'auto-rename-helpers',
    description: 'Renames helper modules across a workspace with import-path rewriting.',
    skillYaml: 'name: auto-rename-helpers\nversion: "0.1.0"\n',
    skillMd: '# Auto Rename Helpers\nAutomates helper renaming.',
  },
};

const REFINEMENT_INPUT = {
  kind: 'refinement' as const,
  targetSkill: 'auto-rename-helpers',
  proposedBy: 'claude-code:harness-refactoring',
  justification:
    'Existing skill misses the case where re-exports live in a separate barrel; adds a phase.',
  content: {
    name: 'auto-rename-helpers',
    description: 'Adds a barrel-rewrite phase to the auto-rename-helpers skill.',
    diff: '--- a/SKILL.md\n+++ b/SKILL.md\n@@\n+## Barrel rewrites\n',
  },
};

describe('emit_skill_proposal definition', () => {
  it('declares the expected name + required fields', () => {
    expect(emitSkillProposalDefinition.name).toBe('emit_skill_proposal');
    expect(emitSkillProposalDefinition.inputSchema.required).toContain('path');
    expect(emitSkillProposalDefinition.inputSchema.required).toContain('kind');
    expect(emitSkillProposalDefinition.inputSchema.required).toContain('proposedBy');
    expect(emitSkillProposalDefinition.inputSchema.required).toContain('justification');
    expect(emitSkillProposalDefinition.inputSchema.required).toContain('content');
  });
});

describe('handleEmitSkillProposal — new-skill', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-proposal-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a proposal file and returns the queue URL', async () => {
    const res = await handleEmitSkillProposal({ ...NEW_SKILL_INPUT, path: tmpDir });
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0]!.text as string);
    expect(payload.id).toMatch(/^proposal_[a-f0-9]{32}$/);
    expect(payload.status).toBe('open');
    expect(payload.queueUrl).toBe('/s/proposals');
    const file = path.join(tmpDir, '.harness', 'proposals', `${payload.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(stored.kind).toBe('new-skill');
    expect(stored.content.name).toBe('auto-rename-helpers');
  });

  it('rejects when skillYaml is missing', async () => {
    const bad = {
      ...NEW_SKILL_INPUT,
      path: tmpDir,
      content: {
        name: NEW_SKILL_INPUT.content.name,
        description: NEW_SKILL_INPUT.content.description,
        skillMd: NEW_SKILL_INPUT.content.skillMd,
      },
    };
    const res = await handleEmitSkillProposal(bad);
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/skillYaml/);
  });

  it('rejects when targetSkill is set on new-skill', async () => {
    const res = await handleEmitSkillProposal({
      ...NEW_SKILL_INPUT,
      path: tmpDir,
      targetSkill: 'other-skill',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/targetSkill is forbidden/);
  });
});

describe('handleEmitSkillProposal — refinement', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-proposal-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a refinement with a diff', async () => {
    const res = await handleEmitSkillProposal({ ...REFINEMENT_INPUT, path: tmpDir });
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0]!.text as string);
    const stored = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.harness', 'proposals', `${payload.id}.json`), 'utf-8')
    );
    expect(stored.kind).toBe('refinement');
    expect(stored.targetSkill).toBe('auto-rename-helpers');
    expect(stored.content.diff).toMatch(/Barrel rewrites/);
  });

  it('rejects when targetSkill is missing', async () => {
    const { targetSkill: _omit, ...bad } = REFINEMENT_INPUT;
    void _omit;
    const res = await handleEmitSkillProposal({ ...bad, path: tmpDir });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/refinement proposals require targetSkill/);
  });

  it('rejects a duplicate open refinement against the same target', async () => {
    const first = await handleEmitSkillProposal({ ...REFINEMENT_INPUT, path: tmpDir });
    expect(first.isError).toBeFalsy();
    const second = await handleEmitSkillProposal({ ...REFINEMENT_INPUT, path: tmpDir });
    expect(second.isError).toBe(true);
    expect(second.content[0]!.text).toMatch(/already exists/);
  });
});

describe('handleEmitSkillProposal — path validation', () => {
  it('rejects empty path', async () => {
    const res = await handleEmitSkillProposal({ ...NEW_SKILL_INPUT, path: '/' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/filesystem root/);
  });
});
