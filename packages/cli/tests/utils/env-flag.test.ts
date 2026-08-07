import { describe, it, expect } from 'vitest';
import { envEnabled } from '../../src/utils/env-flag';

describe('envEnabled', () => {
  it('is truthy for 1|true|yes|on, case-insensitive and trimmed', () => {
    for (const v of ['1', 'true', 'TRUE', 'Yes', 'on', 'ON', '  true  ']) {
      expect(envEnabled(v)).toBe(true);
    }
  });
  it('is falsy for undefined, empty, and non-affirmative values', () => {
    for (const v of [undefined, '', '0', 'false', 'no', 'off', 'maybe']) {
      expect(envEnabled(v)).toBe(false);
    }
  });
});
