import type { TokenBudget, TokenBudgetOverrides } from './budget.types';

const DEFAULT_RATIOS = {
  systemPrompt: 0.15,
  projectManifest: 0.05,
  taskSpec: 0.2,
  activeCode: 0.4,
  interfaces: 0.1,
  reserve: 0.1,
} as const;

/**
 * Map graph node types to budget categories
 */
const NODE_TYPE_TO_CATEGORY: Record<string, keyof typeof DEFAULT_RATIOS> = {
  file: 'activeCode',
  function: 'activeCode',
  class: 'activeCode',
  method: 'activeCode',
  interface: 'interfaces',
  variable: 'interfaces',
  adr: 'projectManifest',
  document: 'projectManifest',
  spec: 'taskSpec',
  task: 'taskSpec',
  prompt: 'systemPrompt',
  system: 'systemPrompt',
};

export function contextBudget(
  totalTokens: number,
  overrides?: TokenBudgetOverrides,
  graphDensity?: Record<string, number>
): TokenBudget {
  const ratios: Record<keyof typeof DEFAULT_RATIOS, number> = {
    systemPrompt: DEFAULT_RATIOS.systemPrompt,
    projectManifest: DEFAULT_RATIOS.projectManifest,
    taskSpec: DEFAULT_RATIOS.taskSpec,
    activeCode: DEFAULT_RATIOS.activeCode,
    interfaces: DEFAULT_RATIOS.interfaces,
    reserve: DEFAULT_RATIOS.reserve,
  };

  if (graphDensity) {
    // Compute density-aware allocation
    const categoryWeights: Record<keyof typeof DEFAULT_RATIOS, number> = {
      systemPrompt: 0,
      projectManifest: 0,
      taskSpec: 0,
      activeCode: 0,
      interfaces: 0,
      reserve: 0,
    };

    for (const [nodeType, count] of Object.entries(graphDensity)) {
      const category = NODE_TYPE_TO_CATEGORY[nodeType];
      if (category) {
        categoryWeights[category] += count;
      }
    }

    const totalWeight = Object.values(categoryWeights).reduce((sum, w) => sum + w, 0);

    if (totalWeight > 0) {
      const MIN_ALLOCATION = 0.01;

      for (const key of Object.keys(ratios) as (keyof typeof DEFAULT_RATIOS)[]) {
        if (categoryWeights[key] > 0) {
          ratios[key] = categoryWeights[key] / totalWeight;
        } else {
          ratios[key] = MIN_ALLOCATION;
        }
      }

      // Ensure reserve and systemPrompt have at least their default ratios
      // since no graph node types map to them
      if (ratios.reserve < DEFAULT_RATIOS.reserve) {
        ratios.reserve = DEFAULT_RATIOS.reserve;
      }
      if (ratios.systemPrompt < DEFAULT_RATIOS.systemPrompt) {
        ratios.systemPrompt = DEFAULT_RATIOS.systemPrompt;
      }

      // Normalize so ratios sum to 1.0
      const ratioSum = Object.values(ratios).reduce((sum, r) => sum + r, 0);
      for (const key of Object.keys(ratios) as (keyof typeof DEFAULT_RATIOS)[]) {
        ratios[key] = ratios[key] / ratioSum;
      }

      // Ensure all categories have at least 1% allocation
      for (const key of Object.keys(ratios) as (keyof typeof DEFAULT_RATIOS)[]) {
        if (ratios[key] < MIN_ALLOCATION) {
          ratios[key] = MIN_ALLOCATION;
        }
      }

      // Re-normalize after enforcing minimums
      const finalSum = Object.values(ratios).reduce((sum, r) => sum + r, 0);
      for (const key of Object.keys(ratios) as (keyof typeof DEFAULT_RATIOS)[]) {
        ratios[key] = ratios[key] / finalSum;
      }
    }
  }

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
    // Use current ratios (which may have been modified by graphDensity) instead of DEFAULT_RATIOS
    if (overrideKeys.length > 0 && overrideKeys.length < 6) {
      const remaining = 1 - overrideSum;
      const nonOverridden = Object.keys(ratios).filter(
        (k) => !overrideKeys.includes(k as keyof typeof DEFAULT_RATIOS)
      ) as (keyof typeof DEFAULT_RATIOS)[];

      const originalSum = nonOverridden.reduce((sum, k) => sum + ratios[k], 0);

      for (const k of nonOverridden) {
        ratios[k] = remaining * (ratios[k] / originalSum);
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
