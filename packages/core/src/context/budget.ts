import type { TokenBudget, TokenBudgetOverrides } from './budget.types';

const DEFAULT_RATIOS = {
  systemPrompt: 0.15,
  projectManifest: 0.05,
  taskSpec: 0.2,
  activeCode: 0.4,
  interfaces: 0.1,
  reserve: 0.1,
} as const;

export function contextBudget(totalTokens: number, overrides?: TokenBudgetOverrides): TokenBudget {
  const ratios: Record<keyof typeof DEFAULT_RATIOS, number> = {
    systemPrompt: DEFAULT_RATIOS.systemPrompt,
    projectManifest: DEFAULT_RATIOS.projectManifest,
    taskSpec: DEFAULT_RATIOS.taskSpec,
    activeCode: DEFAULT_RATIOS.activeCode,
    interfaces: DEFAULT_RATIOS.interfaces,
    reserve: DEFAULT_RATIOS.reserve,
  };

  if (overrides) {
    let overrideSum = 0;
    const overrideKeys: (keyof typeof DEFAULT_RATIOS)[] = [];

    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined && key in ratios) {
        const k = key as keyof typeof DEFAULT_RATIOS;
        ratios[k] = value;
        overrideSum += value;
        overrideKeys.push(k);
      }
    }

    // Redistribute remaining budget proportionally among non-overridden categories
    if (overrideKeys.length > 0 && overrideKeys.length < 6) {
      const remaining = 1 - overrideSum;
      const nonOverridden = Object.keys(DEFAULT_RATIOS).filter(
        (k) => !overrideKeys.includes(k as keyof typeof DEFAULT_RATIOS)
      ) as (keyof typeof DEFAULT_RATIOS)[];

      const originalSum = nonOverridden.reduce((sum, k) => sum + DEFAULT_RATIOS[k], 0);

      for (const k of nonOverridden) {
        ratios[k] = remaining * (DEFAULT_RATIOS[k] / originalSum);
      }
    }
  }

  return {
    total: totalTokens,
    systemPrompt: Math.floor(totalTokens * ratios.systemPrompt),
    projectManifest: Math.floor(totalTokens * ratios.projectManifest),
    taskSpec: Math.floor(totalTokens * ratios.taskSpec),
    activeCode: Math.floor(totalTokens * ratios.activeCode),
    interfaces: Math.floor(totalTokens * ratios.interfaces),
    reserve: Math.floor(totalTokens * ratios.reserve),
  };
}
