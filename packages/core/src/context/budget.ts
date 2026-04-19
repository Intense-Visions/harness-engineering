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

type RatioKey = keyof typeof DEFAULT_RATIOS;

function makeZeroWeights(): Record<RatioKey, number> {
  return {
    systemPrompt: 0,
    projectManifest: 0,
    taskSpec: 0,
    activeCode: 0,
    interfaces: 0,
    reserve: 0,
  };
}

function normalizeRatios(ratios: Record<RatioKey, number>): void {
  const sum = Object.values(ratios).reduce((s, r) => s + r, 0);
  if (sum === 0) return;
  for (const key of Object.keys(ratios) as RatioKey[]) {
    ratios[key] = ratios[key] / sum;
  }
}

function enforceMinimumRatios(ratios: Record<RatioKey, number>, min: number): void {
  for (const key of Object.keys(ratios) as RatioKey[]) {
    if (ratios[key] < min) ratios[key] = min;
  }
}

function applyGraphDensity(
  ratios: Record<RatioKey, number>,
  graphDensity: Record<string, number>
): void {
  const weights = makeZeroWeights();
  for (const [nodeType, count] of Object.entries(graphDensity)) {
    const category = NODE_TYPE_TO_CATEGORY[nodeType];
    if (category) weights[category] += count;
  }

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return;

  const MIN = 0.01;
  for (const key of Object.keys(ratios) as RatioKey[]) {
    ratios[key] = weights[key] > 0 ? weights[key] / totalWeight : MIN;
  }

  // Ensure reserve and systemPrompt keep at least their defaults
  if (ratios.reserve < DEFAULT_RATIOS.reserve) ratios.reserve = DEFAULT_RATIOS.reserve;
  if (ratios.systemPrompt < DEFAULT_RATIOS.systemPrompt)
    ratios.systemPrompt = DEFAULT_RATIOS.systemPrompt;

  normalizeRatios(ratios);
  enforceMinimumRatios(ratios, MIN);
  normalizeRatios(ratios);
}

export function contextBudget(
  totalTokens: number,
  overrides?: TokenBudgetOverrides,
  graphDensity?: Record<string, number>
): TokenBudget {
  if (totalTokens <= 0) {
    return {
      total: 0,
      systemPrompt: 0,
      projectManifest: 0,
      taskSpec: 0,
      activeCode: 0,
      interfaces: 0,
      reserve: 0,
    };
  }

  const ratios: Record<RatioKey, number> = {
    systemPrompt: DEFAULT_RATIOS.systemPrompt,
    projectManifest: DEFAULT_RATIOS.projectManifest,
    taskSpec: DEFAULT_RATIOS.taskSpec,
    activeCode: DEFAULT_RATIOS.activeCode,
    interfaces: DEFAULT_RATIOS.interfaces,
    reserve: DEFAULT_RATIOS.reserve,
  };

  if (graphDensity) {
    applyGraphDensity(ratios, graphDensity);
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
      const nonOverridden = Object.keys(ratios).filter(
        (k) => !overrideKeys.includes(k as keyof typeof DEFAULT_RATIOS)
      ) as (keyof typeof DEFAULT_RATIOS)[];

      const remaining = Math.max(0, 1 - overrideSum);
      const originalSum = nonOverridden.reduce((sum, k) => sum + ratios[k], 0);

      for (const k of nonOverridden) {
        ratios[k] =
          originalSum > 0
            ? remaining * (ratios[k] / originalSum)
            : remaining / nonOverridden.length;
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
