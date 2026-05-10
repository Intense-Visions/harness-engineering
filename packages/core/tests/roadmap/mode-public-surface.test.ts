import { describe, it, expect } from 'vitest';
import { getRoadmapMode } from '@harness-engineering/core';

describe('roadmap mode public surface', () => {
  it('exports getRoadmapMode from @harness-engineering/core', () => {
    expect(typeof getRoadmapMode).toBe('function');
    expect(getRoadmapMode({})).toBe('file-backed');
  });
});
