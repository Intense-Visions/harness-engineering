import { describe, it, expect } from 'vitest';
import { generateUlid, isValidUlid, ensureIdentity } from '../../src/index';
import type { HarnessIdentity } from '../../src/index';

describe('core barrel — identity surface', () => {
  it('re-exports the identity engine from the package entry point', () => {
    expect(typeof generateUlid).toBe('function');
    expect(typeof isValidUlid).toBe('function');
    expect(typeof ensureIdentity).toBe('function');
  });
  it('re-exports the HarnessIdentity type through core', () => {
    const id: HarnessIdentity = {
      ulid: generateUlid(),
      slug: 's',
      domain: 'session',
      createdAt: new Date().toISOString(),
      number: null,
      completedAt: null,
    };
    expect(isValidUlid(id.ulid)).toBe(true);
  });
});
