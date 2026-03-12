import { describe, it, expect } from 'vitest';
import { resolveEntryPoints, parseDocumentationFile, buildSnapshot } from '../../src/entropy/snapshot';
import { TypeScriptParser } from '../../src/shared/parsers';
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

describe('buildSnapshot', () => {
  const fixturesDir = join(__dirname, '../fixtures/entropy/valid-project');
  const parser = new TypeScriptParser();

  it('should build complete snapshot', async () => {
    const result = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { drift: true, deadCode: true },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md', 'README.md'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files.length).toBeGreaterThan(0);
      expect(result.value.docs.length).toBeGreaterThan(0);
      expect(result.value.entryPoints.length).toBeGreaterThan(0);
      expect(result.value.exportMap.byName.size).toBeGreaterThan(0);
    }
  });

  it('should build export map indexed by name', async () => {
    const result = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exportMap.byName.has('createUser')).toBe(true);
      expect(result.value.exportMap.byName.has('validateEmail')).toBe(true);
    }
  });
});
