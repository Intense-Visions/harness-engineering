import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprintFile } from '../../src/duplication/index';

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
