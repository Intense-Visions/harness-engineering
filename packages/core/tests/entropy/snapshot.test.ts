import { describe, it, expect } from 'vitest';
import { resolveEntryPoints } from '../../src/entropy/snapshot';
import { join } from 'path';

describe('resolveEntryPoints', () => {
  const fixturesDir = join(__dirname, '../fixtures/entropy/valid-project');

  it('should resolve entry points from package.json exports', async () => {
    const result = await resolveEntryPoints(fixturesDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.some(e => e.includes('index.ts'))).toBe(true);
    }
  });

  it('should use explicit entry points when provided', async () => {
    const result = await resolveEntryPoints(fixturesDir, ['src/user.ts']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toContain('user.ts');
    }
  });

  it('should fall back to conventions when no package.json', async () => {
    const result = await resolveEntryPoints(join(fixturesDir, 'src'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some(e => e.includes('index.ts'))).toBe(true);
    }
  });
});
