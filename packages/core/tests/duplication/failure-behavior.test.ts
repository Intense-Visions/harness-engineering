import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprintFile, buildCloneIndex } from '../../src/duplication/index';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dup-fail-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'src', 'good.ts'),
    `export function ok(a: number) {\n  return a + 1;\n}\n`,
    'utf8'
  );
  await writeFile(join(root, 'src', 'broken.ts'), `export function broken( {\n`, 'utf8');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('fingerprintFile', () => {
  it('returns fingerprinted units for a readable, parseable file', async () => {
    const result = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts');
    expect(result.status).toBe('scanned');
    if (result.status !== 'scanned') return;
    expect(result.units.map((u) => u.member.unit)).toEqual(['ok']);
    expect(result.units[0]!.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(result.units[0]!.member.file).toBe('src/good.ts');
  });

  it('reports skipped for an unreadable file rather than throwing', async () => {
    const result = await fingerprintFile(join(root, 'src', 'absent.ts'), 'src/absent.ts');
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') return;
    expect(result.reason).toBe('unreadable');
  });

  it('reports skipped for an unparseable file rather than throwing', async () => {
    const result = await fingerprintFile(join(root, 'src', 'broken.ts'), 'src/broken.ts');
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') return;
    expect(result.reason).toBe('unparseable');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('parses .tsx with the jsx option enabled', async () => {
    const tsx = join(root, 'src', 'view.tsx');
    await writeFile(
      tsx,
      `export function View() {\n  return <div className="a">hi</div>;\n}\n`,
      'utf8'
    );
    const result = await fingerprintFile(tsx, 'src/view.tsx');
    expect(result.status).toBe('scanned');
  });

  it('excludes a sub-minTokens unit from fingerprinting instead of emitting it', async () => {
    // The amended spec applies minTokens BEFORE grouping: a unit under the bar
    // is never hashed, so it cannot form or join a clone class.
    const below = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts', 1000);
    expect(below.status).toBe('scanned');
    if (below.status !== 'scanned') return;
    expect(below.units).toEqual([]);
    expect(below.unitsBelowMinTokens).toBe(1);

    const above = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts', 1);
    expect(above.status).toBe('scanned');
    if (above.status !== 'scanned') return;
    expect(above.units.map((u) => u.member.unit)).toEqual(['ok']);
    expect(above.unitsBelowMinTokens).toBe(0);
  });
});

describe('zero-discovery guard', () => {
  it('returns Err for an empty file list rather than an empty index', async () => {
    const result = await buildCloneIndex([], { rootDir: root });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_CONFIG');
    expect(result.error.message).toMatch(/zero source files/i);
    expect(result.error.details.reason).toBe('zero-files-discovered');
    expect(result.error.suggestions.length).toBeGreaterThan(0);
  });

  it('returns Err when every candidate is filtered out by extension', async () => {
    const result = await buildCloneIndex([join(root, 'notes.md')], { rootDir: root });
    expect(result.ok).toBe(false);
  });

  it('returns Err when ignorePatterns exclude every candidate', async () => {
    const result = await buildCloneIndex([join(root, 'src', 'good.ts')], {
      rootDir: root,
      ignorePatterns: ['**/src/**'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/zero source files/i);
  });

  it('returns Err when every eligible file is skipped', async () => {
    // At 100% skip, `classes: []` is indistinguishable from the zero-discovery
    // case the guard above refuses: nothing was actually read, so reporting a
    // clean pass would be a lie.
    const result = await buildCloneIndex([join(root, 'src', 'absent.ts')], {
      rootDir: root,
      ignorePatterns: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PARSE_ERROR');
    expect(result.error.details.reason).toBe('all-files-skipped');
    expect(result.error.message).toMatch(/zero readable source files/i);
    expect(result.error.message).toMatch(/1 unreadable/);
    expect(result.error.suggestions.length).toBeGreaterThan(0);
  });

  it('returns Err when every eligible file is unparseable, not Ok with zero classes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dup-allbroken-'));
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      for (const name of ['a.ts', 'b.ts', 'c.ts']) {
        await writeFile(join(dir, 'src', name), `export function broken( {\n`, 'utf8');
      }
      const result = await buildCloneIndex(
        ['a.ts', 'b.ts', 'c.ts'].map((n) => join(dir, 'src', n)),
        { rootDir: dir, ignorePatterns: [] }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details.reason).toBe('all-files-skipped');
      expect(result.error.message).toMatch(/3 unparseable/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('still returns Ok for a partial skip, recording the skip as evidence', async () => {
    // 1-of-N is a scan that happened: it read real files and can report on them.
    const result = await buildCloneIndex(
      [join(root, 'src', 'good.ts'), join(root, 'src', 'absent.ts')],
      { rootDir: root, ignorePatterns: [] }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stats.filesScanned).toBe(1);
    expect(result.value.stats.filesSkipped).toBe(1);
    expect(result.value.skipped).toEqual([
      { file: 'src/absent.ts', reason: 'unreadable', message: expect.any(String) },
    ]);
    expect(result.value.skipped[0]!.message.length).toBeGreaterThan(0);
  });

  it('records a parse failure on skipped with its reason and message', async () => {
    const result = await buildCloneIndex(
      [join(root, 'src', 'good.ts'), join(root, 'src', 'broken.ts')],
      { rootDir: root, ignorePatterns: [] }
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.skipped.map((entry) => [entry.file, entry.reason])).toEqual([
      ['src/broken.ts', 'unparseable'],
    ]);
    // The evidence Phase 2 needs to raise an AnalysisError, not a bare count.
    expect(result.value.skipped[0]!.message.length).toBeGreaterThan(0);
    expect(result.value.stats.filesSkipped).toBe(result.value.skipped.length);
  });
});
