import { describe, it, expect } from 'vitest';
// Direct imports used because workspace:* dependencies are not linked in worktrees.
// In CI with full npm install, use: import { extractLevel, computeLoadPlan } from '@harness-engineering/core';
import { extractLevel } from '../../../../core/src/context/section-parser';
import { computeLoadPlan } from '../../../../core/src/context/progressive-loader';

describe('progressive loading integration', () => {
  const sampleContent = [
    '# My Skill',
    '',
    '> Brief description',
    '',
    '## Process',
    '',
    '1. Do step one',
    '2. Do step two',
    '',
    '## Gates',
    '',
    '- Must not skip',
    '',
    '## Success Criteria',
    '',
    '- Tests pass',
    '',
    '## Examples',
    '',
    '### Example 1',
    '',
    'Example content.',
    '',
    '## Escalation',
    '',
    '- Ask for help if stuck',
    '',
  ].join('\n');

  it('level 1 returns only rules sections', () => {
    const result = extractLevel(sampleContent, 1);
    expect(result).toContain('## Process');
    expect(result).toContain('## Gates');
    expect(result).not.toContain('## Success Criteria');
    expect(result).not.toContain('## Examples');
    expect(result).not.toContain('## Escalation');
  });

  it('level 3 includes source but not errors', () => {
    const result = extractLevel(sampleContent, 3);
    expect(result).toContain('## Examples');
    expect(result).not.toContain('## Escalation');
  });

  it('level 5 returns everything', () => {
    const result = extractLevel(sampleContent, 5);
    expect(result).toBe(sampleContent);
  });

  it('load plan degrades under pressure', () => {
    const skills = Array.from({ length: 100 }, (_, i) => ({
      name: `skill-${i}`,
      budget: { max_tokens: 4000, priority: i < 10 ? 1 : 5 },
    }));

    const plan = computeLoadPlan(skills, {
      totalBudget: 100000,
      skillCountThreshold: 80,
    });

    const highPriority = plan.filter((p) => p.skillName.match(/^skill-[0-9]$/));
    const lowPriority = plan.filter((p) => !p.skillName.match(/^skill-[0-9]$/));

    const avgHighLevel = highPriority.reduce((sum, p) => sum + p.level, 0) / highPriority.length;
    const avgLowLevel = lowPriority.reduce((sum, p) => sum + p.level, 0) / lowPriority.length;

    expect(avgHighLevel).toBeGreaterThan(avgLowLevel);
  });
});
