import { describe, it, expect } from 'vitest';
import { DEFAULT_FIND_FILES_IGNORE } from '../../src/index';

describe('core barrel — DEFAULT_FIND_FILES_IGNORE', () => {
  it('is exported from the package entry point', () => {
    expect(Array.isArray(DEFAULT_FIND_FILES_IGNORE)).toBe(true);
  });

  it('includes the node_modules skip glob', () => {
    expect(DEFAULT_FIND_FILES_IGNORE.some((g) => g.includes('node_modules'))).toBe(true);
  });
});
