import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverSourceFiles } from '../../src/security-craft/extract/discover';

describe('discoverSourceFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-discover-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content = '// stub'): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('returns [] when packages/ does not exist', () => {
    expect(discoverSourceFiles(tmpDir)).toEqual([]);
  });

  it('discovers .ts files under packages/*/src/', () => {
    writeFile('packages/api/src/handlers.ts');
    writeFile('packages/api/src/lib/util.ts');
    writeFile('packages/web/src/app.tsx');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(3);
  });

  it('excludes test files by extension', () => {
    writeFile('packages/api/src/handlers.ts');
    writeFile('packages/api/src/handlers.test.ts');
    writeFile('packages/api/src/handlers.spec.ts');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('handlers.ts');
  });

  it('excludes tests/ and __tests__/ subdirs', () => {
    writeFile('packages/api/src/real.ts');
    writeFile('packages/api/src/tests/fake.ts');
    writeFile('packages/api/src/__tests__/fake.ts');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('real.ts');
  });

  it('excludes dist/build/coverage/node_modules dirs', () => {
    writeFile('packages/api/src/real.ts');
    writeFile('packages/api/src/dist/built.ts');
    writeFile('packages/api/src/build/output.ts');
    writeFile('packages/api/src/coverage/index.ts');
    writeFile('packages/api/src/node_modules/lib/index.ts');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('real.ts');
  });

  it('honors packagesFilter to restrict scope', () => {
    writeFile('packages/api/src/a.ts');
    writeFile('packages/web/src/b.ts');
    writeFile('packages/cli/src/c.ts');
    const files = discoverSourceFiles(tmpDir, ['api', 'cli']);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.includes('web/'))).toBe(false);
  });

  it('includes .mjs / .cjs / .jsx extensions', () => {
    writeFile('packages/api/src/esm.mjs');
    writeFile('packages/api/src/cjs.cjs');
    writeFile('packages/api/src/comp.jsx');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(3);
  });

  it('ignores non-source extensions', () => {
    writeFile('packages/api/src/data.json');
    writeFile('packages/api/src/notes.md');
    writeFile('packages/api/src/real.ts');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('real.ts');
  });
});
