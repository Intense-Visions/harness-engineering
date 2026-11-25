// tests/utils/relative-imports.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearRelativeImportCaches,
  readRelativeImports,
  resolveRelativeImport,
  toGraphKey,
} from '../../src/utils/relative-imports';

let root: string;

function write(rel: string, code = ''): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, code);
  return abs;
}

beforeEach(() => {
  clearRelativeImportCaches();
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'relative-imports-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveRelativeImport', () => {
  it('prefers the exact path, then TS sources, then extensions, then index', () => {
    const from = write('src/from.ts');
    write('src/exact.js');
    write('src/exact.ts');
    write('src/esm.mts');
    write('src/plain.tsx');
    write('src/dir/index.js');
    expect(resolveRelativeImport(from, './exact.js')).toBe(
      toGraphKey(path.join(root, 'src/exact.js'))
    );
    expect(resolveRelativeImport(from, './esm.mjs')).toBe(
      toGraphKey(path.join(root, 'src/esm.mts'))
    );
    expect(resolveRelativeImport(from, './plain')).toBe(
      toGraphKey(path.join(root, 'src/plain.tsx'))
    );
    expect(resolveRelativeImport(from, './dir')).toBe(
      toGraphKey(path.join(root, 'src/dir/index.js'))
    );
  });

  it('returns null for bare and missing specifiers', () => {
    const from = write('src/from.ts');
    expect(resolveRelativeImport(from, 'lodash')).toBeNull();
    expect(resolveRelativeImport(from, './missing')).toBeNull();
  });
});

describe('readRelativeImports', () => {
  it('keeps runtime edges and drops type-only ones', () => {
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) write(`src/${name}.ts`);
    const file = write(
      'src/main.ts',
      [
        `import { a } from './a';`,
        `import type { B } from './b';`,
        `import { type C } from './c';`,
        `export { d } from './d';`,
        `export type { E } from './e';`,
        `export * from './f';`,
        `import g = require('./g');`,
        `import './h';`,
        `import x from 'external';`,
      ].join('\n')
    );
    const names = readRelativeImports(file).map((k) => path.basename(k));
    expect(names.sort()).toEqual(['a.ts', 'd.ts', 'f.ts', 'g.ts', 'h.ts']);
  });

  it('returns [] for files it cannot read', () => {
    expect(readRelativeImports(path.join(root, 'nope.ts'))).toEqual([]);
  });

  it('skips files larger than the lazy-read bound', () => {
    write('src/a.ts');
    const big = write(
      'src/big.ts',
      `import { a } from './a';\n` + '//'.padEnd(1024 * 1024 + 10, 'x')
    );
    expect(readRelativeImports(big)).toEqual([]);
  });
});
