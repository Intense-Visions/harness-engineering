import { describe, expect, it } from 'vitest';
import {
  LOCAL_MODELS_PACKAGE,
  LOCAL_MODELS_VERSION,
  estimateVram,
  estimateTokPerSec,
  pickBackend,
  QUANT_BITS,
  BACKEND_EFFICIENCY,
} from '../src/index.js';

describe('@harness-engineering/local-models scaffold', () => {
  it('exposes the package identifier constant', () => {
    expect(LOCAL_MODELS_PACKAGE).toBe('@harness-engineering/local-models');
  });

  it('exposes a version constant matching package.json', () => {
    expect(LOCAL_MODELS_VERSION).toBe('0.1.0');
  });

  it('re-exports the Phase 2b VRAM + speed surface through the root barrel (OT15)', () => {
    expect(typeof estimateVram).toBe('function');
    expect(typeof estimateTokPerSec).toBe('function');
    expect(typeof pickBackend).toBe('function');
    expect(QUANT_BITS.Q4_K_M).toBeGreaterThan(0);
    expect(BACKEND_EFFICIENCY.cuda).toBeGreaterThan(0);
  });
});
