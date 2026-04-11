import { describe, it, expect, vi } from 'vitest';
import { CompactionPipeline } from '../../src/compaction/pipeline';
import type { CompactionStrategy } from '../../src/compaction/strategies/structural';

const makeStrategy = (
  name: 'structural' | 'truncate' | 'pack' | 'semantic',
  transform: (s: string) => string
): CompactionStrategy => ({
  name,
  lossy: false,
  apply: vi.fn().mockImplementation(transform),
});

describe('CompactionPipeline', () => {
  it('applies a single strategy to input', () => {
    const s = makeStrategy('structural', (x) => x.toUpperCase());
    const pipeline = new CompactionPipeline([s]);
    expect(pipeline.apply('hello')).toBe('HELLO');
  });

  it('chains multiple strategies in order', () => {
    const s1 = makeStrategy('structural', (x) => x + '-A');
    const s2 = makeStrategy('truncate', (x) => x + '-B');
    const pipeline = new CompactionPipeline([s1, s2]);
    expect(pipeline.apply('start')).toBe('start-A-B');
  });

  it('passes budget to each strategy', () => {
    const applySpy = vi.fn().mockReturnValue('result');
    const s: CompactionStrategy = { name: 'structural', lossy: false, apply: applySpy };
    const pipeline = new CompactionPipeline([s]);
    pipeline.apply('input', 500);
    expect(applySpy).toHaveBeenCalledWith('input', 500);
  });

  it('returns input unchanged when no strategies are provided', () => {
    const pipeline = new CompactionPipeline([]);
    expect(pipeline.apply('no-op')).toBe('no-op');
  });

  it('exposes the list of strategy names', () => {
    const s1 = makeStrategy('structural', (x) => x);
    const s2 = makeStrategy('truncate', (x) => x);
    const pipeline = new CompactionPipeline([s1, s2]);
    expect(pipeline.strategyNames).toEqual(['structural', 'truncate']);
  });

  it('handles empty string input without error', () => {
    const s = makeStrategy('structural', (x) => x);
    const pipeline = new CompactionPipeline([s]);
    expect(pipeline.apply('')).toBe('');
  });
});
