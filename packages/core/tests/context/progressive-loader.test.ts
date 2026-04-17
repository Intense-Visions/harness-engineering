import { describe, it, expect } from 'vitest';
import { computeLoadPlan, DEFAULT_LOADER_CONFIG } from '../../src/context/progressive-loader';

interface SkillContextBudget {
  max_tokens: number;
  priority: number;
}

function makeSkills(
  count: number,
  budget?: Partial<SkillContextBudget>
): Array<{ name: string; budget?: SkillContextBudget }> {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${i}`,
    budget: budget
      ? { max_tokens: budget.max_tokens ?? 4000, priority: budget.priority ?? 3 }
      : undefined,
  }));
}

describe('computeLoadPlan', () => {
  it('returns all skills at level 5 when below threshold', () => {
    const skills = makeSkills(10);
    const plan = computeLoadPlan(skills, { totalBudget: 100000, skillCountThreshold: 80 });
    expect(plan).toHaveLength(10);
    expect(plan.every((p) => p.level === 5)).toBe(true);
  });

  it('downgrades skills when at threshold', () => {
    const skills = makeSkills(80);
    const plan = computeLoadPlan(skills, { totalBudget: 100000, skillCountThreshold: 80 });
    expect(plan).toHaveLength(80);
    // Some skills should be downgraded since 80 * 4000 = 320000 > 100000
    const degraded = plan.filter((p) => p.level < 5);
    expect(degraded.length).toBeGreaterThan(0);
  });

  it('downgrades lowest-priority skills first', () => {
    const skills = [
      { name: 'high-priority', budget: { max_tokens: 4000, priority: 1 } },
      { name: 'low-priority', budget: { max_tokens: 4000, priority: 5 } },
    ];
    // Very tight budget forces degradation
    const plan = computeLoadPlan(skills, { totalBudget: 4000, skillCountThreshold: 1 });
    const high = plan.find((p) => p.skillName === 'high-priority')!;
    const low = plan.find((p) => p.skillName === 'low-priority')!;
    expect(high.level).toBeGreaterThanOrEqual(low.level);
  });

  it('assigns default budget when skill has no context_budget', () => {
    const skills = [{ name: 'no-budget' }];
    const plan = computeLoadPlan(skills, { totalBudget: 100000, skillCountThreshold: 1 });
    expect(plan[0]!.allocatedTokens).toBe(4000);
    expect(plan[0]!.level).toBe(5);
  });

  it('respects explicit max_tokens', () => {
    const skills = [{ name: 'small', budget: { max_tokens: 500, priority: 3 } }];
    const plan = computeLoadPlan(skills, { totalBudget: 100000, skillCountThreshold: 1 });
    expect(plan[0]!.allocatedTokens).toBeLessThanOrEqual(500);
  });

  it('never goes below level 1', () => {
    const skills = makeSkills(200);
    const plan = computeLoadPlan(skills, { totalBudget: 1000, skillCountThreshold: 1 });
    expect(plan.every((p) => p.level >= 1)).toBe(true);
  });

  it('returns empty array for empty input', () => {
    const plan = computeLoadPlan([], { totalBudget: 100000, skillCountThreshold: 80 });
    expect(plan).toEqual([]);
  });

  it('uses default config when not provided', () => {
    const skills = makeSkills(10);
    const plan = computeLoadPlan(skills);
    expect(plan).toHaveLength(10);
    expect(plan.every((p) => p.level === 5)).toBe(true);
  });
});

describe('DEFAULT_LOADER_CONFIG', () => {
  it('has threshold of 80', () => {
    expect(DEFAULT_LOADER_CONFIG.skillCountThreshold).toBe(80);
  });

  it('has totalBudget of 200000', () => {
    expect(DEFAULT_LOADER_CONFIG.totalBudget).toBe(200000);
  });
});
