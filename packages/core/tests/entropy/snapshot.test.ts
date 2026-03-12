import { describe, it, expect } from 'vitest';
import { resolveEntryPoints, parseDocumentationFile } from '../../src/entropy/snapshot';
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

describe('parseDocumentationFile', () => {
  const fixturesDir = join(__dirname, '../fixtures/entropy/valid-project');

  it('should parse markdown file and extract code blocks', async () => {
    const result = await parseDocumentationFile(join(fixturesDir, 'README.md'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('markdown');
      expect(result.value.codeBlocks.length).toBeGreaterThan(0);
      expect(result.value.codeBlocks[0].language).toBe('typescript');
    }
  });

  it('should extract inline references', async () => {
    const result = await parseDocumentationFile(join(fixturesDir, 'docs/api.md'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inlineRefs.length).toBeGreaterThan(0);
      expect(result.value.inlineRefs.some(r => r.reference === 'createUser')).toBe(true);
    }
  });
});
