import { describe, it, expect } from 'vitest';
import { configureMergeOursDriver } from './merge-driver-setup';

describe('configureMergeOursDriver', () => {
  it('invokes git with config merge.ours.driver true and reports configured', async () => {
    const calls: string[][] = [];
    const result = await configureMergeOursDriver('/tmp/project', (args) => {
      calls.push(args);
    });
    expect(calls).toEqual([['config', 'merge.ours.driver', 'true']]);
    expect(result.configured).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('returns a non-fatal warning (resolves, no throw) when the runner throws', async () => {
    const result = await configureMergeOursDriver('/tmp/project', () => {
      throw new Error('git not found');
    });
    expect(result.configured).toBe(false);
    expect(result.warning).toBeTruthy();
    expect(result.warning).toContain('merge.ours.driver');
  });
});
