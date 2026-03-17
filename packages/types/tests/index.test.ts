import { describe, it, expect } from 'vitest';
import { Ok, Err, isOk, isErr, STANDARD_COGNITIVE_MODES } from '../src/index.js';

describe('Result helpers', () => {
  it('Ok creates a successful result', () => {
    const result = Ok(42);
    expect(result.ok).toBe(true);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('Err creates a failed result', () => {
    const result = Err(new Error('fail'));
    expect(result.ok).toBe(false);
    expect(result).toEqual({ ok: false, error: new Error('fail') });
  });

  it('isOk narrows successful results', () => {
    const result = Ok('hello');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe('hello');
    }
  });

  it('isErr narrows failed results', () => {
    const result = Err('bad');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe('bad');
    }
  });

  it('isOk returns false for Err', () => {
    expect(isOk(Err('x'))).toBe(false);
  });

  it('isErr returns false for Ok', () => {
    expect(isErr(Ok(1))).toBe(false);
  });
});

describe('STANDARD_COGNITIVE_MODES', () => {
  it('exports the expected cognitive modes', () => {
    expect(STANDARD_COGNITIVE_MODES).toContain('adversarial-reviewer');
    expect(STANDARD_COGNITIVE_MODES).toContain('constructive-architect');
    expect(STANDARD_COGNITIVE_MODES).toContain('meticulous-implementer');
    expect(STANDARD_COGNITIVE_MODES).toContain('diagnostic-investigator');
    expect(STANDARD_COGNITIVE_MODES).toContain('advisory-guide');
    expect(STANDARD_COGNITIVE_MODES).toContain('meticulous-verifier');
    expect(STANDARD_COGNITIVE_MODES).toHaveLength(6);
  });
});
