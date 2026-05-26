import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveSourceFile } from '../../src/test-craft/extract/source-pair';

describe('resolveSourceFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-pair-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('resolves sibling foo.test.ts → foo.ts', () => {
    writeFile('foo.ts', 'export const x = 1;');
    writeFile('foo.test.ts', `it('x', () => {});`);
    const result = resolveSourceFile(path.join(tmpDir, 'foo.test.ts'));
    expect(result).not.toBeNull();
    expect(result!.file).toBe(path.join(tmpDir, 'foo.ts'));
    expect(result!.content).toContain('export const x = 1');
  });

  it('resolves tests/foo.test.ts → src/foo.ts (peer dirs)', () => {
    writeFile('src/foo.ts', 'export const y = 2;');
    writeFile('tests/foo.test.ts', `it('y', () => {});`);
    const result = resolveSourceFile(path.join(tmpDir, 'tests', 'foo.test.ts'));
    expect(result).not.toBeNull();
    expect(result!.file).toContain('src');
  });

  it('resolves foo.spec.ts the same way as foo.test.ts', () => {
    writeFile('foo.ts', 'export const z = 3;');
    writeFile('foo.spec.ts', `it('z', () => {});`);
    const result = resolveSourceFile(path.join(tmpDir, 'foo.spec.ts'));
    expect(result).not.toBeNull();
    expect(result!.file).toBe(path.join(tmpDir, 'foo.ts'));
  });

  it('returns null when no matching source file exists', () => {
    writeFile('orphan.test.ts', `it('x', () => {});`);
    const result = resolveSourceFile(path.join(tmpDir, 'orphan.test.ts'));
    expect(result).toBeNull();
  });

  it('truncates source content over 2000 chars', () => {
    const longContent = 'x'.repeat(3000);
    writeFile('foo.ts', longContent);
    writeFile('foo.test.ts', `it('x', () => {});`);
    const result = resolveSourceFile(path.join(tmpDir, 'foo.test.ts'))!;
    expect(result.content.length).toBeLessThan(longContent.length);
    expect(result.content).toContain('[…truncated');
  });
});
