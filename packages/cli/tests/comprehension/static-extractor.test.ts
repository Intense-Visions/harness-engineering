import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isStaticSupported,
  renderInterfaceContract,
  renderDependencySlice,
  createStaticExtractor,
} from '../../src/comprehension/static-extractor';
import type { ComprehensionSourceFile } from '@harness-engineering/core';

async function writeModule(
  root: string,
  moduleDir: string,
  files: Record<string, string>
): Promise<ComprehensionSourceFile[]> {
  const abs = path.join(root, moduleDir);
  await fsp.mkdir(abs, { recursive: true });
  const sourceFiles: ComprehensionSourceFile[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(abs, rel);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, content, 'utf-8');
    // The canonical reader keys SourceFile.path by module-relative posix basename
    // for DIRECT files; nested files carry their relative path (not a module member).
    sourceFiles.push({ path: rel, content });
  }
  return sourceFiles;
}

const SUPPORTED_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const UNSUPPORTED_EXTS = ['.py', '.go', '.rs'];

describe('static-extractor render primitives', () => {
  describe('isStaticSupported', () => {
    it('accepts the TS/JS family', () => {
      for (const ext of SUPPORTED_EXTS) {
        expect(isStaticSupported(ext)).toBe(true);
      }
    });
    it('rejects unsupported languages', () => {
      for (const ext of UNSUPPORTED_EXTS) {
        expect(isStaticSupported(ext)).toBe(false);
      }
    });
  });

  describe('renderInterfaceContract', () => {
    it('renders each export on its own line, deterministically sorted', () => {
      const out = renderInterfaceContract([{ name: 'compileModule' }, { name: 'Foo' }]);
      expect(out).toContain('compileModule');
      expect(out).toContain('Foo');
      const lines = out.split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      // deterministic sort: 'Foo' (uppercase) sorts before 'compileModule'
      expect(lines[0]).toContain('Foo');
      expect(lines[1]).toContain('compileModule');
    });
    it('dedups by name', () => {
      const out = renderInterfaceContract([{ name: 'Foo' }, { name: 'Foo' }]);
      expect(out.split('\n').filter(Boolean)).toHaveLength(1);
    });
    it('renders an empty surface as an empty string (never faked)', () => {
      expect(renderInterfaceContract([])).toBe('');
    });
  });

  describe('renderDependencySlice', () => {
    it('groups specifiers by source, one line per source, sorted', () => {
      const out = renderDependencySlice([
        { source: 'node:crypto', specifiers: ['createHash'] },
        { source: './types', specifiers: ['SourceFile'] },
      ]);
      expect(out).toContain('node:crypto');
      expect(out).toContain('createHash');
      expect(out).toContain('./types');
      expect(out).toContain('SourceFile');
      const lines = out.split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      // sorted by source: './types' before 'node:crypto'
      expect(lines[0]).toContain('./types');
      expect(lines[1]).toContain('node:crypto');
    });
    it('folds a default and namespace import into the source line', () => {
      const out = renderDependencySlice([
        { source: 'react', default: 'React' },
        { source: 'node:path', namespace: 'path' },
      ]);
      expect(out).toContain('React');
      expect(out).toContain('react');
      expect(out).toContain('path');
      expect(out).toContain('node:path');
    });
    it('renders an empty slice as an empty string', () => {
      expect(renderDependencySlice([])).toBe('');
    });
  });
});

describe('createStaticExtractor (concrete ExtractStatic over core AST)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'static-extractor-'));
  });
  afterEach(async () => {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  });

  it('anchors the public surface on index.ts when a barrel is present', async () => {
    const sourceFiles = await writeModule(projectRoot, 'mod', {
      'index.ts': "export { foo } from './a';\n",
      'a.ts':
        "import { createHash } from 'node:crypto';\nexport function foo() {\n  return createHash('sha256');\n}\n",
    });
    const extract = createStaticExtractor({ projectRoot, module: 'mod' });
    const { interfaceContract, dependencySlice } = await extract(sourceFiles);
    expect(interfaceContract).toContain('foo');
    // barrel-anchored: 'a.ts' is NOT surfaced directly, only re-exports via index
    expect(dependencySlice).toContain('node:crypto');
    expect(dependencySlice).toContain('createHash');
  });

  it('unions all top-level exports when there is no barrel', async () => {
    const sourceFiles = await writeModule(projectRoot, 'mod', {
      'a.ts': 'export function alpha() {}\n',
      'b.ts': 'export const beta = 1;\n',
    });
    const extract = createStaticExtractor({ projectRoot, module: 'mod' });
    const { interfaceContract } = await extract(sourceFiles);
    expect(interfaceContract).toContain('alpha');
    expect(interfaceContract).toContain('beta');
  });

  it('degrades to empty static sections for an unsupported language (never faked)', async () => {
    const sourceFiles = await writeModule(projectRoot, 'mod', {
      'main.py': 'def foo():\n    pass\n',
    });
    const extract = createStaticExtractor({ projectRoot, module: 'mod' });
    const { interfaceContract, dependencySlice } = await extract(sourceFiles);
    expect(interfaceContract).toBe('');
    expect(dependencySlice).toBe('');
  });

  it('iterates only the passed sourceFiles — a nested subdir file is not reflected', async () => {
    // Physically write a nested file, but do NOT include it in sourceFiles (the
    // canonical reader is non-recursive: the subdir is its own module, D3).
    const sourceFiles = await writeModule(projectRoot, 'mod', {
      'a.ts': 'export const top = 1;\n',
      'sub/nested.ts': 'export const nested = 42;\n',
    });
    const directOnly = sourceFiles.filter((f) => !f.path.includes('/'));
    const extract = createStaticExtractor({ projectRoot, module: 'mod' });
    const { interfaceContract } = await extract(directOnly);
    expect(interfaceContract).toContain('top');
    expect(interfaceContract).not.toContain('nested');
  });
});
