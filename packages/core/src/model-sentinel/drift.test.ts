import { describe, it, expect } from 'vitest';
import { detectModelDrift } from './drift';
import { snapshotModelIdentities } from './snapshot';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const snap = (backends: Record<string, unknown>) => snapshotModelIdentities(backends, NOW);

describe('detectModelDrift', () => {
  it('reports initial drift with no deltas when there is no previous snapshot', () => {
    const current = snap({ p: { type: 'anthropic', model: 'm1' } });
    const result = detectModelDrift(null, current);
    expect(result.kind).toBe('initial');
    expect(result.severity).toBe('none');
    expect(result.deltas).toEqual([]);
    expect(result.previousDigest).toBeNull();
    expect(result.currentDigest).toBe(current.digest);
  });

  it('reports unchanged when digests match', () => {
    const a = snap({ p: { type: 'anthropic', model: 'm1' } });
    const b = snap({ p: { type: 'anthropic', model: 'm1' } });
    const result = detectModelDrift(a, b);
    expect(result.kind).toBe('unchanged');
    expect(result.severity).toBe('none');
    expect(result.deltas).toEqual([]);
  });

  it('flags a model swap as material changed drift with a delta', () => {
    const before = snap({ p: { type: 'anthropic', model: 'claude-opus-4-8' } });
    const after = snap({ p: { type: 'anthropic', model: 'claude-opus-5' } });
    const result = detectModelDrift(before, after);
    expect(result.kind).toBe('changed');
    expect(result.severity).toBe('material');
    expect(result.deltas).toEqual([
      {
        backend: 'p',
        status: 'changed',
        before: ['claude-opus-4-8'],
        after: ['claude-opus-5'],
        addedModels: ['claude-opus-5'],
        removedModels: ['claude-opus-4-8'],
      },
    ]);
  });

  it('flags an added backend as material', () => {
    const before = snap({ p: { type: 'anthropic', model: 'm1' } });
    const after = snap({
      p: { type: 'anthropic', model: 'm1' },
      l: { type: 'local', model: 'q1' },
    });
    const result = detectModelDrift(before, after);
    expect(result.severity).toBe('material');
    const added = result.deltas.find((d) => d.backend === 'l');
    expect(added).toMatchObject({ status: 'added', before: [], after: ['q1'] });
  });

  it('flags a removed backend as material', () => {
    const before = snap({
      p: { type: 'anthropic', model: 'm1' },
      l: { type: 'local', model: 'q1' },
    });
    const after = snap({ p: { type: 'anthropic', model: 'm1' } });
    const result = detectModelDrift(before, after);
    expect(result.severity).toBe('material');
    const removed = result.deltas.find((d) => d.backend === 'l');
    expect(removed).toMatchObject({ status: 'removed', before: ['q1'], after: [] });
  });

  it('treats a digest change with no model delta (only type label) as benign', () => {
    const before = snap({ p: { type: 'anthropic', model: 'm1' } });
    const after = snap({ p: { type: 'openai', model: 'm1' } });
    const result = detectModelDrift(before, after);
    expect(result.kind).toBe('changed');
    expect(result.severity).toBe('benign');
    expect(result.deltas).toEqual([]);
  });
});
