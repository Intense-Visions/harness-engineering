import { describe, it, expect } from 'vitest';
import { HarnessConfigSchema, DepsConfigSchema, loadDepsExclude } from '../../src/config/schema';

describe('HarnessConfigSchema — deps block (#1188)', () => {
  it('accepts a config carrying a deps.exclude block', () => {
    const parsed = HarnessConfigSchema.safeParse({
      version: 1,
      deps: { exclude: ['**/vendor/**'] },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.deps?.exclude).toEqual(['**/vendor/**']);
    }
  });

  it('accepts a config with no deps block', () => {
    expect(HarnessConfigSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('re-exports DepsConfigSchema and loadDepsExclude from the config barrel', () => {
    expect(typeof DepsConfigSchema.parse).toBe('function');
    expect(typeof loadDepsExclude).toBe('function');
  });
});
