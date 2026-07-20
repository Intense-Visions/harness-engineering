import { describe, it, expect } from 'vitest';
import {
  shouldRequestUnstickAdvice,
  buildUnstickPrompt,
  formatUnstickAdvisory,
  UNSTICK_SCHEMA,
  DEFAULT_REASONER_ASSIST_AFTER,
} from './unstick-advisory';

describe('shouldRequestUnstickAdvice', () => {
  const base = {
    bound: 7,
    assistAfter: DEFAULT_REASONER_ASSIST_AFTER,
    reasonerBackendName: 'reasoner',
  };

  it('is false before the executor has stalled (attempts < assistAfter)', () => {
    expect(shouldRequestUnstickAdvice({ ...base, attempts: 1 })).toBe(false);
    expect(shouldRequestUnstickAdvice({ ...base, attempts: 2 })).toBe(false);
  });

  it('is true once stalled and while retry budget remains', () => {
    expect(shouldRequestUnstickAdvice({ ...base, attempts: 3 })).toBe(true);
    expect(shouldRequestUnstickAdvice({ ...base, attempts: 6 })).toBe(true);
  });

  it('is false at/after the retry bound (no budget left → escalate to human, not reasoner)', () => {
    expect(shouldRequestUnstickAdvice({ ...base, attempts: 7 })).toBe(false);
    expect(shouldRequestUnstickAdvice({ ...base, attempts: 8 })).toBe(false);
  });

  it('is false when no reasoner backend is configured (graceful degradation)', () => {
    expect(
      shouldRequestUnstickAdvice({ ...base, attempts: 4, reasonerBackendName: undefined })
    ).toBe(false);
    expect(shouldRequestUnstickAdvice({ ...base, attempts: 4, reasonerBackendName: '' })).toBe(
      false
    );
  });
});

describe('buildUnstickPrompt', () => {
  it('includes the task, a fenced diff, and a fenced failure', () => {
    const p = buildUnstickPrompt({
      taskText: 'Add rule no-spread-in-variadic',
      gateReason: "no-spread-in-variadic.ts(48,42): error TS2532: Object is possibly 'undefined'.",
      diffText: '+ const first = arr[0];',
    });
    expect(p).toContain('Add rule no-spread-in-variadic');
    expect(p).toContain('<<<DIFF');
    expect(p).toContain('+ const first = arr[0];');
    expect(p).toContain('<<<FAILURE');
    expect(p).toContain('error TS2532');
  });

  it('handles an empty diff gracefully', () => {
    const p = buildUnstickPrompt({ taskText: 't', gateReason: 'boom', diffText: '   ' });
    expect(p).toContain('(no diff captured)');
    expect(p).not.toContain('<<<DIFF');
  });
});

describe('formatUnstickAdvisory', () => {
  it('renders diagnosis + fix as labelled senior guidance', () => {
    const out = formatUnstickAdvisory({
      diagnosis: 'arr[0] is possibly undefined under noUncheckedIndexedAccess',
      fix: 'Guard with `if (arr.length === 0) return;` before indexing at line 48.',
    });
    expect(out).toMatch(/senior engineer/i);
    expect(out).toContain('Root cause:');
    expect(out).toContain('noUncheckedIndexedAccess');
    expect(out).toContain('Fix to apply:');
    expect(out).toContain('line 48');
  });
});

describe('UNSTICK_SCHEMA', () => {
  it('accepts a well-formed advice object and rejects a malformed one', () => {
    expect(UNSTICK_SCHEMA.safeParse({ diagnosis: 'x', fix: 'y' }).success).toBe(true);
    expect(UNSTICK_SCHEMA.safeParse({ diagnosis: 'x' }).success).toBe(false);
  });
});
