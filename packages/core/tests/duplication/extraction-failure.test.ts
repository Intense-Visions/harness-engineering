import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `fingerprintFile` documents "never throws", but only `parse` used to sit
// inside a try: extraction, normalization and digest ran outside it. With
// `loc: true` always passed by the internal caller, no real input reaches those
// throws, so the only way to prove the catch arm exists is to make a
// post-parse stage fail.
//
// Normalization is OUR stage, not the file's, so this is an `internal-error`
// rather than `unextractable` — the distinction that keeps the all-skip advice
// from blaming the sources for a runtime failure. `extraction-error.test.ts`
// covers the other arm, where the AST really is at fault.
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
  it('reports skipped/internal-error rather than throwing when our own stage fails', async () => {
    const result = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts');
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') return;
    expect(result.reason).toBe('internal-error');
    expect(result.message).toContain('synthetic normalization failure');
    // The class of failure, not just its message: a bare string cannot tell a
    // caller whether the file or the runtime is at fault.
    expect(result.errorName).toBe('Error');
    expect(result.originalError).toBeInstanceOf(Error);
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
    expect(result.error.message).toContain('1 internal-error');
    expect(result.error.details.originalError).toBeInstanceOf(Error);
  });

  it('advises about the runtime, not the sources, when the failure is ours', async () => {
    // The misleading case: a FIPS-mode Node where createHash('sha1') throws
    // made every file fail, and the fixed advice was "Check file permissions"
    // and "Check that the discovered files are valid TS/JS".
    const result = await buildCloneIndex([join(root, 'src', 'good.ts')], {
      rootDir: root,
      ignorePatterns: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const advice = result.error.suggestions.join('\n');
    expect(advice).toMatch(/normalization or digest/i);
    expect(advice).not.toMatch(/file permissions/i);
    expect(advice).not.toMatch(/valid TS\/JS/i);
    // The first failure still names itself, now with its error class.
    expect(advice).toContain('src/good.ts');
    expect(advice).toContain('Error: synthetic normalization failure');
  });
});
