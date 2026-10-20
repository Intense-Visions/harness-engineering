import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `fingerprintFile` documents "never throws", but only `parse` used to sit
// inside a try: extraction, normalization and digest ran outside it. With
// `loc: true` always passed by the internal caller, no real input reaches those
// throws, so the only way to prove the catch arm exists is to make a
// post-parse stage fail.
vi.mock('../../src/duplication/tokens', async () => {
  const actual = await vi.importActual<typeof import('../../src/duplication/tokens')>(
    '../../src/duplication/tokens'
  );
  return {
    ...actual,
    normalizeTokens: () => {
      throw new Error('synthetic normalization failure');
    },
  };
});

const { fingerprintFile, buildCloneIndex } = await import('../../src/duplication/index');

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dup-extract-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'src', 'good.ts'),
    `export function ok(a: number) {\n  return a + 1;\n}\n`,
    'utf8'
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('fingerprintFile — post-parse failures', () => {
  it('reports skipped/unextractable rather than throwing when a post-parse stage fails', async () => {
    const result = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts');
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') return;
    expect(result.reason).toBe('unextractable');
    expect(result.message).toContain('synthetic normalization failure');
  });

  it('surfaces the post-parse failure through buildCloneIndex as a recorded skip', async () => {
    const result = await buildCloneIndex([join(root, 'src', 'good.ts')], {
      rootDir: root,
      ignorePatterns: [],
    });
    // Every eligible file skipped, so the all-skip guard fires — with the real
    // reason attached rather than an Ok over zero classes.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details.reason).toBe('all-files-skipped');
    expect(result.error.message).toContain('1 unextractable');
  });
});
