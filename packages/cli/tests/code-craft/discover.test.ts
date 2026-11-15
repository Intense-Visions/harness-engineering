import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverSourceFiles } from '../../src/code-craft/extract/discover';
import { EXTENSION_MAP } from '@harness-engineering/core';

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

  it('discovers every language harness supports, and nothing else', () => {
    writeFile('src/a.ts');
    writeFile('src/b.py');
    writeFile('src/c.go');
    writeFile('src/d.rs');
    writeFile('src/E.java');
    writeFile('src/notes.txt');
    const found = discoverSourceFiles(tmpDir)
      .map((f) => path.basename(f))
      .sort();
    expect(found).toEqual(['E.java', 'a.ts', 'b.py', 'c.go', 'd.rs']);
  });

  /**
   * DRIVEN OFF EXTENSION_MAP, not off a list written here.
   *
   * The hand-written table above names five extensions and would have stayed
   * green while `.mts` and `.cts` were discovered but extracted nothing (I2).
   * This one plants one file per EXTENSION_MAP key, so a seventh language — or
   * a new extension for an existing one — shows up as a failure the day it is
   * added rather than as a silent zero in a run summary.
   */
  it('discovers one file per EXTENSION_MAP extension, with none missing', () => {
    const extensions = Object.keys(EXTENSION_MAP);
    expect(
      extensions.length,
      'EXTENSION_MAP is empty — the table below is vacuous'
    ).toBeGreaterThanOrEqual(12);

    extensions.forEach((ext, i) => writeFile(`src/unit${i}${ext}`));
    writeFile('src/notes.txt'); // negative control: not in EXTENSION_MAP
    writeFile('src/data.json'); // negative control

    const found = discoverSourceFiles(tmpDir).map((f) => path.extname(f));
    for (const ext of extensions) {
      expect(found, `${ext} is in EXTENSION_MAP but discovery skipped it`).toContain(ext);
    }
    expect(found).not.toContain('.txt');
    expect(found).not.toContain('.json');
    expect(found).toHaveLength(extensions.length);
  });

  it('excludes test files in every language, not only TS/JS', () => {
    writeFile('src/a.test.ts');
    writeFile('src/test_b.py');
    writeFile('src/b_test.py');
    writeFile('src/c_test.go');
    writeFile('src/CartTest.java');
    writeFile('src/b.py');
    const found = discoverSourceFiles(tmpDir).map((f) => path.basename(f));
    expect(found).not.toContain('a.test.ts');
    expect(found).not.toContain('test_b.py');
    expect(found).not.toContain('b_test.py');
    expect(found).not.toContain('c_test.go');
    expect(found).not.toContain('CartTest.java');
    expect(found).toContain('b.py'); // positive control: production python survives
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
