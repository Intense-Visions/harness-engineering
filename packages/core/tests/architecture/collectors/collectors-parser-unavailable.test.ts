/**
 * The coupling and forbidden-imports collectors must abstain with a named cause
 * when the parser cannot run, not report an unexplained empty denominator
 * (#2267, #2284). The per-file syntax-error skip is pinned in
 * `tests/entropy/snapshot-parser-unavailable.test.ts` (`parseSourceFiles`,
 * which coupling consumes) and in `forbidden-imports.test.ts`.
 *
 * `vi.mock` with a throwing factory makes the real default loader's `import()`
 * reject, as a broken install does. The collector uses the default registry,
 * so this is the only way to reach the branch without a stand-in parser. In its
 * own file because the module mock is file-scoped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';

vi.mock('@typescript-eslint/typescript-estree', () => {
  throw new Error("Cannot find module '@typescript-eslint/typescript-estree'");
});

import { CouplingCollector } from '../../../src/architecture/collectors/coupling';
import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports';
import type { ArchConfig } from '../../../src/architecture/types';

const config: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

describe('dependency collectors with an unavailable parser (#2267)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(join(os.tmpdir(), 'coupling-unavail-'));
    await fsp.writeFile(join(root, 'a.ts'), "import { b } from './b';\nexport const a = b;\n");
    await fsp.writeFile(join(root, 'b.ts'), 'export const b = 1;\n');
  });
  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it('reports the parser cause in metadata.error rather than a measured zero', async () => {
    const results = await new CouplingCollector().collect(config, root);

    expect(results).toHaveLength(1);
    const meta = results[0]!.metadata as Record<string, unknown>;
    expect(meta.error).toEqual(expect.stringContaining('parser is unavailable'));
    expect(meta.filesAnalyzed).toBeUndefined();
  });

  it('forbidden-imports reports the parser cause instead of filesAnalyzed: 0', async () => {
    const rules = [{ from: '**/*.ts', disallow: ['node:child_process'] }];
    const results = await new ForbiddenImportCollector().collect(
      { ...config, forbiddenImports: rules },
      root
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.metadata).toEqual({
      rulesConfigured: 1,
      error: expect.stringContaining('could not be loaded'),
    });
  });
});
