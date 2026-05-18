import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createProposal, updateProposal, getProposal } from '@harness-engineering/core';
import { runGate } from '../../src/proposals/gate';
import { promote, GateNotReadyError, PromotionError } from '../../src/proposals/promote';

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const validYaml = 'name: ok-skill\nversion: "0.1.0"\ndescription: A nice description.\n';
const validMd =
  '# Ok Skill\n\nA non-trivial description with enough characters to pass the gate.\n';

const NEW_SKILL_INPUT = {
  kind: 'new-skill' as const,
  proposedBy: 'tester',
  justification:
    'Recurring pattern observed across three sessions justifies a dedicated skill for it.',
  content: {
    name: 'ok-skill',
    description: 'Renames helper modules and rewrites their imports across the workspace.',
    skillYaml: validYaml,
    skillMd: validMd,
  },
};

describe('promote — new skill', () => {
  it('writes skill files with provenance + originatingProposalId', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    await runGate(tmpDir, p.id);
    const result = await promote(tmpDir, p.id, 'tester');
    expect(result.provenance).toBe('agent-proposed');
    const yamlPath = path.join(result.skillPath, 'skill.yaml');
    const mdPath = path.join(result.skillPath, 'SKILL.md');
    expect(fs.existsSync(yamlPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    const yaml = fs.readFileSync(yamlPath, 'utf-8');
    expect(yaml).toContain('provenance: agent-proposed');
    expect(yaml).toContain(`originatingProposalId: ${p.id}`);
    const proposal = await getProposal(tmpDir, p.id);
    expect(proposal?.status).toBe('approved');
    expect(proposal?.decision?.decidedBy).toBe('tester');
  });

  it('refuses promotion when gate has not run', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    await expect(promote(tmpDir, p.id, 'tester')).rejects.toBeInstanceOf(GateNotReadyError);
  });

  it('refuses promotion when gate has errors', async () => {
    const p = await createProposal(tmpDir, {
      ...NEW_SKILL_INPUT,
      content: { ...NEW_SKILL_INPUT.content, skillYaml: 'name: ok-skill\n' },
    });
    await runGate(tmpDir, p.id);
    await expect(promote(tmpDir, p.id, 'tester')).rejects.toBeInstanceOf(GateNotReadyError);
  });

  it('refuses promotion when a catalog skill with that name already exists', async () => {
    const skillDir = path.join(
      tmpDir,
      'agents',
      'skills',
      'claude-code',
      NEW_SKILL_INPUT.content.name
    );
    fs.mkdirSync(skillDir, { recursive: true });
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    await runGate(tmpDir, p.id);
    await expect(promote(tmpDir, p.id, 'tester')).rejects.toBeInstanceOf(PromotionError);
  });

  it('refuses promotion when the gate run is stale (>24h)', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    await runGate(tmpDir, p.id);
    // Walk the lastRunAt back 25h.
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await updateProposal(tmpDir, p.id, {
      gate: { lastRunAt: stale, findings: [] },
    });
    await expect(promote(tmpDir, p.id, 'tester')).rejects.toBeInstanceOf(GateNotReadyError);
  });
});

describe('promote — refinement', () => {
  const REFINEMENT_INPUT = {
    kind: 'refinement' as const,
    targetSkill: 'ok-skill',
    proposedBy: 'tester',
    justification:
      'The existing skill misses a recurring case; add a barrel-rewrite phase to cover it.',
    content: {
      name: 'ok-skill',
      description: 'Adds a barrel-rewrite phase to cover an additional case.',
      diff: '--- a/SKILL.md\n+++ b/SKILL.md\n@@\n+## Barrel rewrites\n',
    },
  };

  it('stamps provenance + originatingProposalId on the existing skill', async () => {
    const skillDir = path.join(
      tmpDir,
      'agents',
      'skills',
      'claude-code',
      REFINEMENT_INPUT.targetSkill
    );
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'skill.yaml'),
      'name: ok-skill\nversion: "0.1.0"\ndescription: existing.\n'
    );
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Ok Skill\n');

    const p = await createProposal(tmpDir, REFINEMENT_INPUT);
    await runGate(tmpDir, p.id);

    const result = await promote(tmpDir, p.id, 'tester');
    const yaml = fs.readFileSync(path.join(result.skillPath, 'skill.yaml'), 'utf-8');
    expect(yaml).toContain('provenance: agent-proposed');
    expect(yaml).toContain(`originatingProposalId: ${p.id}`);
  });

  it('refuses promotion when target skill does not exist', async () => {
    const p = await createProposal(tmpDir, REFINEMENT_INPUT);
    await runGate(tmpDir, p.id);
    await expect(promote(tmpDir, p.id, 'tester')).rejects.toBeInstanceOf(PromotionError);
  });
});
