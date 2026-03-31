import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseLiteLLMData, getModelPrice } from '../../src/pricing/pricing';
import type { LiteLLMPricingData, PricingDataset } from '../../src/pricing/types';

describe('parseLiteLLMData', () => {
  it('should parse Claude model pricing from LiteLLM format', () => {
    const raw: LiteLLMPricingData = {
      'claude-sonnet-4-20250514': {
        input_cost_per_token: 3e-6,
        output_cost_per_token: 1.5e-5,
        cache_read_input_token_cost: 3e-7,
        cache_creation_input_token_cost: 3.75e-6,
        mode: 'chat',
      },
    };
    const dataset = parseLiteLLMData(raw);
    const pricing = dataset.get('claude-sonnet-4-20250514');
    expect(pricing).toBeDefined();
    expect(pricing!.inputPer1M).toBeCloseTo(3.0, 4);
    expect(pricing!.outputPer1M).toBeCloseTo(15.0, 4);
    expect(pricing!.cacheReadPer1M).toBeCloseTo(0.3, 4);
    expect(pricing!.cacheWritePer1M).toBeCloseTo(3.75, 4);
  });

  it('should skip non-chat models (image_generation, embedding, etc.)', () => {
    const raw: LiteLLMPricingData = {
      'dall-e-3': {
        mode: 'image_generation',
      },
      'text-embedding-3-small': {
        input_cost_per_token: 2e-8,
        mode: 'embedding',
      },
    };
    const dataset = parseLiteLLMData(raw);
    expect(dataset.size).toBe(0);
  });

  it('should skip sample_spec entry', () => {
    const raw: LiteLLMPricingData = {
      sample_spec: {
        input_cost_per_token: 0,
        output_cost_per_token: 0,
        mode: 'chat',
      },
    };
    const dataset = parseLiteLLMData(raw);
    expect(dataset.size).toBe(0);
  });

  it('should handle models without cache pricing', () => {
    const raw: LiteLLMPricingData = {
      'gpt-4o': {
        input_cost_per_token: 2.5e-6,
        output_cost_per_token: 1e-5,
        cache_read_input_token_cost: 1.25e-6,
        mode: 'chat',
      },
    };
    const dataset = parseLiteLLMData(raw);
    const pricing = dataset.get('gpt-4o');
    expect(pricing).toBeDefined();
    expect(pricing!.cacheReadPer1M).toBeCloseTo(1.25, 4);
    expect(pricing!.cacheWritePer1M).toBeUndefined();
  });

  it('should skip models with no input or output cost', () => {
    const raw: LiteLLMPricingData = {
      'broken-model': {
        mode: 'chat',
      },
    };
    const dataset = parseLiteLLMData(raw);
    expect(dataset.size).toBe(0);
  });
});

describe('getModelPrice', () => {
  it('should return pricing for a known model', () => {
    const dataset: PricingDataset = new Map([
      [
        'claude-sonnet-4-20250514',
        { inputPer1M: 3.0, outputPer1M: 15.0, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
      ],
    ]);
    const result = getModelPrice('claude-sonnet-4-20250514', dataset);
    expect(result).toEqual({
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheWritePer1M: 3.75,
    });
  });

  it('should return null and log warning for unknown model', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dataset: PricingDataset = new Map();
    const result = getModelPrice('nonexistent-model', dataset);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent-model'));
    warnSpy.mockRestore();
  });

  it('should return null for undefined model string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dataset: PricingDataset = new Map();
    const result = getModelPrice(undefined as unknown as string, dataset);
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });
});
