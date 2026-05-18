import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createProposal, getProposal } from '@harness-engineering/core';
import { runGate, GateRunError } from '../../src/proposals/gate';

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
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

describe('runGate — new-skill', () => {
  it('passes a well-formed new-skill proposal', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    const result = await runGate(tmpDir, p.id);
    expect(result.status).toBe('gate-running');
    expect(result.findings.some((f) => f.severity === 'error')).toBe(false);
    const after = await getProposal(tmpDir, p.id);
    expect(after?.status).toBe('gate-running');
    expect(after?.gate?.lastRunAt).toBeTruthy();
  });

  it('flags missing version in skill.yaml', async () => {
    const p = await createProposal(tmpDir, {
      ...NEW_SKILL_INPUT,
      content: {
        ...NEW_SKILL_INPUT.content,
        skillYaml: 'name: ok-skill\ndescription: ok\n',
      },
    });
    const result = await runGate(tmpDir, p.id);
    expect(result.status).toBe('gate-failed');
    expect(result.findings.some((f) => f.title.includes('version'))).toBe(true);
  });

  it('flags too-short SKILL.md', async () => {
    const p = await createProposal(tmpDir, {
      ...NEW_SKILL_INPUT,
      content: { ...NEW_SKILL_INPUT.content, skillMd: '# x\n' },
    });
    const result = await runGate(tmpDir, p.id);
    expect(result.status).toBe('gate-failed');
    expect(result.findings.some((f) => f.title.includes('too short'))).toBe(true);
  });
});

describe('runGate — refinement', () => {
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

  it('passes a well-formed unified diff', async () => {
    const p = await createProposal(tmpDir, REFINEMENT_INPUT);
    const result = await runGate(tmpDir, p.id);
    expect(result.status).toBe('gate-running');
    expect(result.findings.some((f) => f.severity === 'error')).toBe(false);
  });

  it('flags a diff missing headers', async () => {
    const p = await createProposal(tmpDir, {
      ...REFINEMENT_INPUT,
      content: { ...REFINEMENT_INPUT.content, diff: 'plain text, not a diff' },
    });
    const result = await runGate(tmpDir, p.id);
    expect(result.status).toBe('gate-failed');
  });
});

describe('runGate — guardrails', () => {
  it('refuses to re-run an approved proposal', async () => {
    const p = await createProposal(tmpDir, NEW_SKILL_INPUT);
    // Manually transition for the test.
    const { updateProposal } = await import('@harness-engineering/core');
    await updateProposal(tmpDir, p.id, {
      status: 'approved',
      decision: { decidedAt: new Date().toISOString(), decidedBy: 'tester', action: 'approved' },
    });
    await expect(runGate(tmpDir, p.id)).rejects.toBeInstanceOf(GateRunError);
  });
});
