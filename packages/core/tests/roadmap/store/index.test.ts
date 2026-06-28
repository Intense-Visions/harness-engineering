import { describe, it, expect } from 'vitest';
import {
  assembleRoadmap,
  ShardStore,
  MonolithStore,
  regenerate,
  writeRegeneratedRoadmap,
  parseShard,
  serializeShard,
  parseMeta,
  serializeMeta,
} from '@harness-engineering/core';

describe('store barrel public surface (@harness-engineering/core)', () => {
  it('re-exports the store functions/classes from the package entry', () => {
    expect(typeof assembleRoadmap).toBe('function');
    expect(typeof regenerate).toBe('function');
    expect(typeof writeRegeneratedRoadmap).toBe('function');
    expect(typeof parseShard).toBe('function');
    expect(typeof serializeShard).toBe('function');
    expect(typeof parseMeta).toBe('function');
    expect(typeof serializeMeta).toBe('function');
    expect(typeof ShardStore).toBe('function');
    expect(typeof MonolithStore).toBe('function');
  });
});
