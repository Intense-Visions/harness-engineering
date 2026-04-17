import type { SkillContextBudget, LoadingLevel } from '@harness-engineering/types';

/** Local copy of the default budget to avoid value import from types package. */
const DEFAULT_BUDGET: SkillContextBudget = { max_tokens: 4000, priority: 3 };

export interface LoaderConfig {
  /** Total token budget across all skills. */
  totalBudget: number;
  /** Skill count at which progressive loading activates. */
  skillCountThreshold: number;
}

export const DEFAULT_LOADER_CONFIG: LoaderConfig = {
  totalBudget: 200_000,
  skillCountThreshold: 80,
};

export interface SkillLoadPlan {
  skillName: string;
  level: LoadingLevel;
  allocatedTokens: number;
}

/** Fraction of max_tokens allocated at each level. */
const LEVEL_FRACTIONS: Record<LoadingLevel, number> = {
  1: 0.2,
  2: 0.4,
  3: 0.7,
  4: 0.9,
  5: 1.0,
};

/**
 * Compute a load plan for a set of skills given a total token budget.
 *
 * When skill count is below the threshold, all skills load at level 5 (full).
 * When at or above threshold, skills are sorted by priority (lowest priority
 * first = first to degrade) and levels are reduced until the total fits
 * within the budget.
 */
export function computeLoadPlan(
  skills: Array<{ name: string; budget?: SkillContextBudget }>,
  config: LoaderConfig = DEFAULT_LOADER_CONFIG
): SkillLoadPlan[] {
  if (skills.length === 0) return [];

  // Resolve effective budgets
  const entries = skills.map((s) => ({
    name: s.name,
    maxTokens: s.budget?.max_tokens ?? DEFAULT_BUDGET.max_tokens,
    priority: s.budget?.priority ?? DEFAULT_BUDGET.priority,
    level: 5 as LoadingLevel,
  }));

  // Below threshold: all at level 5
  if (entries.length < config.skillCountThreshold) {
    return entries.map((e) => ({
      skillName: e.name,
      level: 5 as LoadingLevel,
      allocatedTokens: e.maxTokens,
    }));
  }

  // Sort by priority descending (highest number = lowest priority = degrade first)
  const sorted = [...entries].sort((a, b) => b.priority - a.priority);

  // Iteratively downgrade lowest-priority skills until budget fits
  let totalTokens = sorted.reduce((sum, e) => sum + e.maxTokens * LEVEL_FRACTIONS[e.level], 0);

  for (const entry of sorted) {
    if (totalTokens <= config.totalBudget) break;

    while (entry.level > 1 && totalTokens > config.totalBudget) {
      const oldAlloc = entry.maxTokens * LEVEL_FRACTIONS[entry.level];
      entry.level = (entry.level - 1) as LoadingLevel;
      const newAlloc = entry.maxTokens * LEVEL_FRACTIONS[entry.level];
      totalTokens -= oldAlloc - newAlloc;
    }
  }

  return sorted.map((e) => ({
    skillName: e.name,
    level: e.level,
    allocatedTokens: Math.floor(e.maxTokens * LEVEL_FRACTIONS[e.level]),
  }));
}
