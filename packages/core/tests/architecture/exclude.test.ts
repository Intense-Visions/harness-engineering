import { describe, it, expect } from 'vitest';
import { isExcluded, resolveExcludePatterns } from '../../src/architecture/exclude';
import { ArchConfigSchema } from '../../src/architecture/types';
import { join } from 'path';

const ROOT = join('/repo');

describe('resolveExcludePatterns', () => {
  it('defaults to an empty list so existing configs are unaffected', () => {
    expect(resolveExcludePatterns(ArchConfigSchema.parse({}))).toEqual([]);
  });

  it('returns the configured patterns', () => {
    const config = ArchConfigSchema.parse({ excludePatterns: ['services/neo/**/*.dag.ts'] });
    expect(resolveExcludePatterns(config)).toEqual(['services/neo/**/*.dag.ts']);
  });

  it('rejects empty pattern strings', () => {
    expect(() => ArchConfigSchema.parse({ excludePatterns: [''] })).toThrow();
  });
});

describe('isExcluded', () => {
  it('returns false when no patterns are configured', () => {
    expect(isExcluded(join(ROOT, 'src', 'a.ts'), ROOT, [])).toBe(false);
  });

  it('matches against the project-relative path, not the absolute one', () => {
    // The temp/checkout prefix must never participate in matching.
    expect(isExcluded(join(ROOT, 'src', 'a.ts'), ROOT, ['/repo/**'])).toBe(false);
    expect(isExcluded(join(ROOT, 'src', 'a.ts'), ROOT, ['src/**'])).toBe(true);
  });

  it('matches a suffix pattern under an arbitrary depth', () => {
    const p = ['services/neo/**/*.dag.ts'];
    expect(isExcluded(join(ROOT, 'services', 'neo', 'me', 'home.dag.ts'), ROOT, p)).toBe(true);
    expect(isExcluded(join(ROOT, 'services', 'neo', 'me', 'home.ts'), ROOT, p)).toBe(false);
    expect(isExcluded(join(ROOT, 'services', 'api', 'me', 'home.dag.ts'), ROOT, p)).toBe(false);
  });

  it('reaches source under dot-directories (dot: true, #1146)', () => {
    expect(isExcluded(join(ROOT, '.server', 'a.ts'), ROOT, ['**/*.ts'])).toBe(true);
  });

  it('is true when any one of several patterns matches', () => {
    const p = ['generated/**', 'services/neo/**/*.dag.ts'];
    expect(isExcluded(join(ROOT, 'generated', 'client.ts'), ROOT, p)).toBe(true);
  });
});
