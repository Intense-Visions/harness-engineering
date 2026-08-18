import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adviseSkillsDefinition, handleAdviseSkills } from './advise-skills.js';

// The handler delegates to runAdviseSkills; we intercept the command module so
// we can pin the handler's own responsibilities: tier partitioning, the
// project-relative skills path, default option coercion, and error shaping.
const runAdviseSkills = vi.hoisted(() => vi.fn());

vi.mock('../../commands/advise-skills.js', () => ({
  runAdviseSkills,
}));

function parse(res: { content: Array<{ text: string }> }) {
  const first = res.content[0];
  if (!first) throw new Error('expected tool response content');
  return JSON.parse(first.text);
}

function match(tier: 'apply' | 'reference' | 'consider', skillName: string) {
  return { tier, skillName, score: 42, when: `use ${skillName}`, matchReasons: ['kw'] };
}

beforeEach(() => {
  runAdviseSkills.mockReset();
});

describe('adviseSkillsDefinition', () => {
  it('declares the advise_skills tool requiring specPath', () => {
    expect(adviseSkillsDefinition.name).toBe('advise_skills');
    expect(adviseSkillsDefinition.inputSchema.required).toEqual(['specPath']);
    expect(adviseSkillsDefinition.inputSchema.properties.thorough.type).toBe('boolean');
  });
});

describe('handleAdviseSkills', () => {
  const projectRoot = path.resolve('proj-root');

  it('partitions matches into apply/reference/consider and relativizes the skills path', async () => {
    runAdviseSkills.mockResolvedValue({
      result: {
        scanDuration: 12,
        matches: [
          match('apply', 'harness-tdd'),
          match('reference', 'harness-verify'),
          match('consider', 'harness-audit'),
        ],
      },
      skillsMdPath: path.join(projectRoot, '.harness', 'SKILLS.md'),
      featureName: 'checkout',
      totalSkills: 7,
    });

    const res = await handleAdviseSkills({ path: projectRoot, specPath: 'docs/specs/x.md' });
    const body = parse(res);

    expect(body.featureName).toBe('checkout');
    expect(body.skillsPath).toBe('.harness/SKILLS.md');
    expect(body.totalScanned).toBe(7);
    expect(body.scanDuration).toBe(12);
    expect(body.apply.map((m: { skill: string }) => m.skill)).toEqual(['harness-tdd']);
    expect(body.reference.map((m: { skill: string }) => m.skill)).toEqual(['harness-verify']);
    expect(body.consider.map((m: { skill: string }) => m.skill)).toEqual(['harness-audit']);
    // The per-match shape re-keys skillName -> skill and matchReasons -> reasons.
    expect(body.apply[0]).toEqual({
      skill: 'harness-tdd',
      score: 42,
      when: 'use harness-tdd',
      reasons: ['kw'],
    });
  });

  it('defaults thorough to false and top to 5 when omitted', async () => {
    runAdviseSkills.mockResolvedValue({
      result: { scanDuration: 1, matches: [] },
      skillsMdPath: path.join(projectRoot, 'SKILLS.md'),
      featureName: 'f',
      totalSkills: 0,
    });

    await handleAdviseSkills({ path: projectRoot, specPath: 'spec.md' });

    expect(runAdviseSkills).toHaveBeenCalledWith({
      specPath: 'spec.md',
      cwd: projectRoot,
      thorough: false,
      top: 5,
    });
  });

  it('passes through explicit thorough and top options', async () => {
    runAdviseSkills.mockResolvedValue({
      result: { scanDuration: 1, matches: [] },
      skillsMdPath: path.join(projectRoot, 'SKILLS.md'),
      featureName: 'f',
      totalSkills: 0,
    });

    await handleAdviseSkills({ path: projectRoot, specPath: 'spec.md', thorough: true, top: 3 });

    expect(runAdviseSkills).toHaveBeenCalledWith({
      specPath: 'spec.md',
      cwd: projectRoot,
      thorough: true,
      top: 3,
    });
  });

  it('falls back to process.cwd() when no path is provided', async () => {
    runAdviseSkills.mockResolvedValue({
      result: { scanDuration: 1, matches: [] },
      skillsMdPath: path.join(process.cwd(), 'SKILLS.md'),
      featureName: 'f',
      totalSkills: 0,
    });

    await handleAdviseSkills({ specPath: 'spec.md' });

    expect(runAdviseSkills).toHaveBeenCalledWith(expect.objectContaining({ cwd: process.cwd() }));
  });

  it('reports a thrown error as a JSON error payload rather than throwing', async () => {
    runAdviseSkills.mockRejectedValue(new Error('spec not found'));

    const res = await handleAdviseSkills({ path: projectRoot, specPath: 'missing.md' });

    expect(parse(res)).toEqual({ error: 'spec not found' });
  });
});
