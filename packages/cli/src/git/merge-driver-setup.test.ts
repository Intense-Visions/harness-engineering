import { describe, it, expect } from 'vitest';
import {
  configureMergeOursDriver,
  configureComprehensionMergeDriver,
  COMPREHENSION_MERGE_DRIVER_COMMAND,
} from './merge-driver-setup';

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

describe('configureComprehensionMergeDriver', () => {
  it('sets merge.comprehension.driver to the regenerate command', async () => {
    const calls: string[][] = [];
    const result = await configureComprehensionMergeDriver('/tmp/project', (args) => {
      calls.push(args);
    });
    expect(calls).toEqual([
      ['config', 'merge.comprehension.driver', COMPREHENSION_MERGE_DRIVER_COMMAND],
    ]);
    expect(result.configured).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('resolves with a non-fatal warning (no throw) when the runner throws', async () => {
    const result = await configureComprehensionMergeDriver('/tmp/project', () => {
      throw new Error('git not found');
    });
    expect(result.configured).toBe(false);
    expect(result.warning).toContain('merge.comprehension.driver');
  });
});
