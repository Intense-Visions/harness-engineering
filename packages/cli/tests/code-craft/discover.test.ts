import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverSourceFiles } from '../../src/code-craft/extract/discover';

describe('discoverSourceFiles (code-craft)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-craft-disc-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'export const x = 1;\n');
  }

  it('returns [] when there is neither a packages/ nor a src/app/ dir', () => {
    expect(discoverSourceFiles(tmpDir)).toEqual([]);
  });

  it('falls back to src/ when packages/ is absent (single-package repo, #1089 gap)', () => {
    writeFile('src/index.ts');
    writeFile('src/lib/util.ts');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.includes(`${path.sep}src${path.sep}`))).toBe(true);
  });

  it('falls back to app/ when packages/ and src/ are both absent', () => {
    writeFile('app/routes/page.ts');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('page.ts');
  });

  it('excludes fixtures/ from the walk (#1089 gap — twins already exclude it)', () => {
    writeFile('packages/api/src/real.ts');
    writeFile('packages/api/src/fixtures/sample.ts');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('real.ts');
  });

  it('excludes test files and build/coverage/node_modules dirs', () => {
    writeFile('packages/api/src/real.ts');
    writeFile('packages/api/src/thing.test.ts');
    writeFile('packages/api/src/dist/output.ts');
    writeFile('packages/api/src/coverage/index.ts');
    writeFile('packages/api/src/node_modules/lib/index.ts');
    writeFile('packages/api/src/__tests__/helper.ts');
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

  it('includes .mjs / .cjs / .jsx extensions and ignores non-source', () => {
    writeFile('packages/api/src/esm.mjs');
    writeFile('packages/api/src/cjs.cjs');
    writeFile('packages/api/src/comp.jsx');
    writeFile('packages/api/src/data.json');
    writeFile('packages/api/src/notes.md');
    const files = discoverSourceFiles(tmpDir);
    expect(files).toHaveLength(3);
  });
});
