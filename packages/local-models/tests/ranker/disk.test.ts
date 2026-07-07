import { describe, it, expect } from 'vitest';
import { estimateDiskGb } from '../../src/ranker/disk.js';

describe('estimateDiskGb (on-disk GGUF footprint ≈ quantized weights)', () => {
  it('sizes a 32B Q4_K_M model into a sane on-disk band', () => {
    const gb = estimateDiskGb({ sizeB: 32, quant: 'Q4_K_M' });
    expect(gb).toBeGreaterThan(15);
    expect(gb).toBeLessThan(24);
  });

  it('is monotonic in sizeB (a bigger model is bigger on disk)', () => {
    const small = estimateDiskGb({ sizeB: 8, quant: 'Q4_K_M' });
    const large = estimateDiskGb({ sizeB: 32, quant: 'Q4_K_M' });
    expect(large).toBeGreaterThan(small);
  });

  it('returns a finite positive number for an unknown quant', () => {
    const gb = estimateDiskGb({ sizeB: 14, quant: 'totally-made-up-quant' });
    expect(Number.isFinite(gb)).toBe(true);
    expect(gb).toBeGreaterThan(0);
  });
});
