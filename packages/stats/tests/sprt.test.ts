import { describe, expect, it } from 'vitest';

import { InvalidSprtConfigError } from '../src/sprt/errors';

describe('InvalidSprtConfigError', () => {
  it('is a distinguishable Error subclass carrying the one failed rule', () => {
    const error = new InvalidSprtConfigError('alpha must be in (0, 1), got 1');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidSprtConfigError');
    expect(error.message).toBe('invalid SprtConfig: alpha must be in (0, 1), got 1');
  });
});
