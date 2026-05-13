import { describe, it, expect } from 'vitest';
import {
  resolveEntryPoints,
  parseDocumentationFile,
  buildSnapshot,
} from '../../src/entropy/snapshot';
import { TypeScriptParser } from '../../src/shared/parsers';
import { join } from 'path';

describe('resolveEntryPoints', () => {
  const fixturesDir = join(__dirname, '../fixtures/entropy/valid-project');
  const entropyFixturesRoot = join(__dirname, '../fixtures/entropy');

  it('should resolve entry points from package.json exports', async () => {
    const result = await resolveEntryPoints(fixturesDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.some((e) => e.includes('index.ts'))).toBe(true);
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
      expect(result.value.some((e) => e.includes('index.ts'))).toBe(true);
    }
  });

  describe('Python projects', () => {
    it('resolves from pyproject.toml + main.py convention', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'python-conventions'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.endsWith('main.py'))).toBe(true);
      }
    });

    it('resolves entry from [project.scripts] in pyproject.toml', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'python-scripts'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.endsWith('cli.py'))).toBe(true);
      }
    });

    it('resolves package directory from [project] name', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'python-package'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => /mypkg.*__init__\.py$/.test(e))).toBe(true);
      }
    });

    it('returns Python-aware suggestions when no entry can be resolved', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'python-empty'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const text = result.error.suggestions.join(' ').toLowerCase();
        expect(text).toMatch(/pyproject|__main__|main\.py/);
      }
    });
  });

  describe('Go projects', () => {
    it('resolves main.go at project root', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'go-main'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.endsWith('main.go'))).toBe(true);
      }
    });

    it('resolves cmd/<name>/main.go layout', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'go-cmd'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => /cmd[\\/]mytool[\\/]main\.go$/.test(e))).toBe(true);
      }
    });
  });

  describe('Rust projects', () => {
    it('resolves src/main.rs convention', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'rust-convention'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.endsWith('main.rs'))).toBe(true);
      }
    });

    it('resolves [[bin]] path entries from Cargo.toml', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'rust-bin'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.endsWith('cli.rs'))).toBe(true);
      }
    });
  });

  describe('Java projects', () => {
    it('resolves Main.java under src/main/java when pom.xml is present', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'java-maven'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.endsWith('Main.java'))).toBe(true);
      }
    });
  });

  describe('polyglot repos', () => {
    it('prefers TypeScript when both package.json and pyproject.toml are present', async () => {
      const result = await resolveEntryPoints(join(entropyFixturesRoot, 'polyglot-ts-py'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.endsWith('index.ts'))).toBe(true);
        expect(result.value.some((e) => e.endsWith('main.py'))).toBe(false);
      }
    });
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
      expect(result.value.inlineRefs.some((r) => r.reference === 'createUser')).toBe(true);
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
