import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The other arm of the post-parse split: when EXTRACTION fails, the AST is at
// fault, so the reason stays `unextractable`. `fingerprintFile` always parses
// with `{ loc: true, range: true }`, so no real input can reach
// `MissingNodeLocationError` through it — the throw has to be injected.
// (`extraction-failure.test.ts` covers the `internal-error` arm, where our own
// normalization stage fails and the file is fine.)
vi.mock('../../src/duplication/units', async () => {
  const actual = await vi.importActual<typeof import('../../src/duplication/units')>(
    '../../src/duplication/units'
  );
  return {
    ...actual,
    extractUnits: () => {
      throw new actual.MissingNodeLocationError('FunctionDeclaration', 'loc');
    },
  };
});

const { fingerprintFile, buildCloneIndex } = await import('../../src/duplication/index');
const { MissingNodeLocationError } = await import('../../src/duplication/units');

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dup-extract-err-'));
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

describe('fingerprintFile — extraction failures', () => {
  it('blames the AST, not the runtime, when extraction throws', async () => {
    const result = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts');
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') return;
    expect(result.reason).toBe('unextractable');
    expect(result.errorName).toBe('MissingNodeLocationError');
    expect(result.originalError).toBeInstanceOf(MissingNodeLocationError);
    expect(result.message).toMatch(/parsed with \{ loc: true, range: true \}/);
  });

  it('records the error class on the index and advises about loc/range', async () => {
    const result = await buildCloneIndex([join(root, 'src', 'good.ts')], {
      rootDir: root,
      ignorePatterns: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('1 unextractable');
    const advice = result.error.suggestions.join('\n');
    expect(advice).toMatch(/loc and range/);
    // Not our stage, so no runtime advice; and not a read or parse failure, so
    // neither of those either.
    expect(advice).not.toMatch(/normalization or digest/i);
    expect(advice).not.toMatch(/file permissions/i);
    expect(advice).toContain('MissingNodeLocationError');
  });
});
