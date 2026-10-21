/**
 * The static extractor must fail closed when the AST parser cannot run at all.
 *
 * Before #2267 a missing `@typescript-eslint/typescript-estree` crashed at
 * module load. Once the parser resolved its estree module lazily, that failure
 * reached `parseMember` as a per-file `Err` — which it treated like a syntax
 * error and skipped. Every member was skipped, so the unit was written with an
 * EMPTY interface contract and dependency slice: a confident "this module
 * exports and imports nothing" over files that were never read, which the
 * pre-commit comprehension hook would then stage.
 *
 * `vi.mock` with a throwing factory makes the real default loader's `import()`
 * reject, which is the shape a broken install produces. In its own file because
 * the module mock is file-scoped. The healthy counterpart (same fixture,
 * non-empty contract) and the per-member syntax-error skip live in
 * `static-extractor.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('@typescript-eslint/typescript-estree', () => {
  throw new Error("Cannot find module '@typescript-eslint/typescript-estree'");
});

import { createStaticExtractor } from '../../src/comprehension/static-extractor';

describe('createStaticExtractor with an unavailable parser (#2267)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'static-extractor-unavail-'));
    await fsp.mkdir(path.join(projectRoot, 'mod'), { recursive: true });
    await fsp.writeFile(
      path.join(projectRoot, 'mod', 'main.ts'),
      "import { used } from './used';\nexport function main() {\n  return used;\n}\n",
      'utf-8'
    );
  });
  afterEach(async () => {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  });

  it('rejects with PARSER_UNAVAILABLE instead of returning empty sections', async () => {
    const extract = createStaticExtractor({ projectRoot, module: 'mod' });
    const content = await fsp.readFile(path.join(projectRoot, 'mod', 'main.ts'), 'utf-8');

    await expect(extract([{ path: 'main.ts', content }])).rejects.toMatchObject({
      code: 'PARSER_UNAVAILABLE',
      message: expect.stringContaining('could not be loaded'),
    });
  });

  it('still returns empty sections for a module with no parseable language', async () => {
    // The parser is never consulted for an unsupported language, so its absence
    // must not turn a legitimate semantic-only unit into an error.
    const extract = createStaticExtractor({ projectRoot, module: 'mod' });
    await expect(extract([{ path: 'main.py', content: 'def f():\n    pass\n' }])).resolves.toEqual({
      interfaceContract: '',
      dependencySlice: '',
    });
  });
});
