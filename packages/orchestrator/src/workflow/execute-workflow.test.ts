import { describe, it, expect } from 'vitest';
import { stageAttemptKey } from './execute-workflow';

describe('stageAttemptKey (split-routing P1)', () => {
  it('produces distinct recorder attempt keys per (stageIndex, attempt) so streams do not clobber', () => {
    const keys = [
      stageAttemptKey(0, 0),
      stageAttemptKey(1, 0),
      stageAttemptKey(2, 0),
      stageAttemptKey(0, 1),
    ];
    expect(new Set(keys).size).toBe(4);
    // encoding is monotonic-per-stage and leaves room for the Phase-3 retry attempt
    expect(stageAttemptKey(0, 0)).toBe(0);
    expect(stageAttemptKey(1, 0)).toBe(1000);
    expect(stageAttemptKey(0, 1)).toBe(1);
  });
});
