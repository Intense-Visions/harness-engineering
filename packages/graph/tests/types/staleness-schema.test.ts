import { describe, it, expect } from 'vitest';
import { GraphNodeSchema } from '../../src/types.js';

describe('GraphNodeSchema staleness field', () => {
  it('round-trips a node carrying a staleness marker', () => {
    const node = {
      id: 'learning:abc',
      type: 'learning',
      name: 'Fixed the widget in packages/gone/x.ts',
      metadata: {},
      staleness: {
        isStale: true,
        reason: 'referenced-file-missing',
        missingReferences: ['packages/gone/x.ts'],
        detectedAt: '2026-08-26T00:00:00.000Z',
      },
    };
    const parsed = GraphNodeSchema.parse(node);
    expect(parsed.staleness?.isStale).toBe(true);
    expect(parsed.staleness?.missingReferences).toEqual(['packages/gone/x.ts']);
  });

  it('is back-compat: a node without staleness still parses', () => {
    const node = {
      id: 'learning:def',
      type: 'learning',
      name: 'A learning with no staleness marker',
      metadata: {},
    };
    const parsed = GraphNodeSchema.parse(node);
    expect(parsed.staleness).toBeUndefined();
  });

  it('rejects an unknown staleness reason', () => {
    const node = {
      id: 'learning:ghi',
      type: 'learning',
      name: 'bad',
      metadata: {},
      staleness: {
        isStale: true,
        reason: 'file-moved',
        missingReferences: [],
        detectedAt: '2026-08-26T00:00:00.000Z',
      },
    };
    expect(() => GraphNodeSchema.parse(node)).toThrow();
  });
});
