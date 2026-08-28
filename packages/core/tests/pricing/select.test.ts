import { describe, it, expect } from 'vitest';
import { cheapestModelByCost } from '../../src/pricing/select';
import type { ModelPricing } from '@harness-engineering/types';
import type { PricingDataset } from '../../src/pricing/types';

const cheap: ModelPricing = { inputPer1M: 0.25, outputPer1M: 1.25 };
const mid: ModelPricing = { inputPer1M: 3.0, outputPer1M: 15.0 };
const pricey: ModelPricing = { inputPer1M: 15.0, outputPer1M: 75.0 };

const dataset: PricingDataset = new Map([
  ['cheap-model', cheap],
  ['mid-model', mid],
  ['pricey-model', pricey],
]);

describe('cheapestModelByCost', () => {
  it('returns the model with the lowest combined cost per 1k tokens', () => {
    const result = cheapestModelByCost(['pricey-model', 'mid-model', 'cheap-model'], dataset);
    expect(result).toBe('cheap-model');
  });

  it('skips models absent from the dataset', () => {
    const result = cheapestModelByCost(['unknown-a', 'mid-model', 'unknown-b'], dataset);
    expect(result).toBe('mid-model');
  });

  it('returns null when none of the models have pricing data', () => {
    expect(cheapestModelByCost(['unknown-a', 'unknown-b'], dataset)).toBeNull();
  });

  it('returns null for an empty model list', () => {
    expect(cheapestModelByCost([], dataset)).toBeNull();
  });

  it('breaks cost ties in favor of the earlier model', () => {
    const tied: PricingDataset = new Map([
      ['first', { inputPer1M: 1.0, outputPer1M: 2.0 }],
      ['second', { inputPer1M: 1.0, outputPer1M: 2.0 }],
    ]);
    expect(cheapestModelByCost(['first', 'second'], tied)).toBe('first');
  });

  it('ranks by input + output combined, not input alone', () => {
    // low-input has cheaper input but far pricier output => not cheapest overall
    const combo: PricingDataset = new Map([
      ['low-input', { inputPer1M: 0.1, outputPer1M: 100.0 }],
      ['balanced', { inputPer1M: 1.0, outputPer1M: 1.0 }],
    ]);
    expect(cheapestModelByCost(['low-input', 'balanced'], combo)).toBe('balanced');
  });
});
