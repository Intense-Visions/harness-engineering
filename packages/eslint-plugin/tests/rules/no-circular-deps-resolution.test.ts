// tests/rules/no-circular-deps-resolution.test.ts
//
// End-to-end behaviour of no-circular-deps against real files on disk, linted
// through ESLint's Linter the way a consumer runs it. These cover the four
// defects that left the rule inert in real repos (Capillary/empower-plus#3509):
// unresolved extensionless specifiers, path-key collisions across `src/` roots,
// dependence on lint order (single-file runs), and type-only imports.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import rule, { clearImportGraph } from '../../src/rules/no-circular-deps';

type Tree = Record<string, string>;

let root: string;

function writeTree(tree: Tree): void {
  for (const [rel, code] of Object.entries(tree)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, code);
  }
}

/** Lint `files` (relative to the fixture root) in order, in one "process". */
function lint(files: string[]): Map<string, Linter.LintMessage[]> {
  const linter = new Linter({ cwd: root });
  const config: Linter.Config[] = [
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: { parser: tsParser as Linter.Parser },
      plugins: { h: { rules: { 'no-circular-deps': rule as never } } },
      rules: { 'h/no-circular-deps': 'error' },
    },
  ];
  const out = new Map<string, Linter.LintMessage[]>();
  for (const rel of files) {
    const abs = path.join(root, rel);
    const messages = linter.verify(fs.readFileSync(abs, 'utf8'), config, { filename: abs });
    const fatal = messages.find((m) => m.fatal);
    if (fatal) throw new Error(`${rel}: ${fatal.message}`);
    out.set(rel, messages);
  }
  return out;
}

function cycleErrors(result: Map<string, Linter.LintMessage[]>): Linter.LintMessage[] {
  return [...result.values()].flat().filter((m) => m.ruleId === 'h/no-circular-deps');
}

beforeEach(() => {
  clearImportGraph();
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'no-circular-deps-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('no-circular-deps against files on disk', () => {
  it('reports a cycle through extensionless imports', () => {
    writeTree({
      'src/a.ts': `import { b } from './b';\nexport const a = () => b;\n`,
      'src/b.ts': `import { a } from './a';\nexport const b = () => a;\n`,
    });
    const errors = cycleErrors(lint(['src/a.ts', 'src/b.ts']));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain('src/a.ts');
    expect(errors[0]!.message).toContain('src/b.ts');
  });

  it('reports a cycle when only one file of the cycle is linted', () => {
    writeTree({
      'src/a.ts': `import { b } from './b';\nexport const a = () => b;\n`,
      'src/b.ts': `import { c } from './c';\nexport const b = () => c;\n`,
      'src/c.ts': `import { a } from './a';\nexport const c = () => a;\n`,
    });
    const result = lint(['src/b.ts']);
    const errors = cycleErrors(result);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe(
      'Circular dependency detected: src/b.ts → src/c.ts → src/a.ts → src/b.ts'
    );
  });

  it('does not collide the same relative path under two src/ roots', () => {
    // packages/a/src/x.ts -> ./y.ts and packages/b/src/y.ts -> ./x.ts share
    // the `src/x.ts` / `src/y.ts` suffix but are four distinct files: no cycle.
    writeTree({
      'packages/a/src/x.ts': `import { y } from './y.ts';\nexport const x = y;\n`,
      'packages/a/src/y.ts': `export const y = 1;\n`,
      'packages/b/src/y.ts': `import { x } from './x.ts';\nexport const y = x;\n`,
      'packages/b/src/x.ts': `export const x = 1;\n`,
    });
    const errors = cycleErrors(lint(['packages/a/src/x.ts', 'packages/b/src/y.ts']));
    expect(errors).toEqual([]);
  });

  it('does not report a cycle that only exists through type-only imports', () => {
    // Explicit extensions so the pre-fix rule (which matched keys verbatim)
    // would have seen this edge pair and flagged it.
    writeTree({
      'src/a.ts': [
        `import type { B } from './b.ts';`,
        `import { type C } from './c.ts';`,
        `export type { D } from './d.ts';`,
        `export const a = 1;`,
        `export type A = B | C;`,
      ].join('\n'),
      'src/b.ts': `import { a } from './a.ts';\nexport type B = typeof a;\n`,
      'src/c.ts': `import { a } from './a.ts';\nexport type C = typeof a;\n`,
      'src/d.ts': `import { a } from './a.ts';\nexport type D = typeof a;\n`,
    });
    const errors = cycleErrors(lint(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts']));
    expect(errors).toEqual([]);
  });

  it('ignores type-only imports in files it loads lazily from disk', () => {
    writeTree({
      'src/a.ts': `import { b } from './b';\nexport const a = 1;\n`,
      'src/b.ts': `import type { A } from './a';\nexport const b: A | 1 = 1;\n`,
    });
    expect(cycleErrors(lint(['src/a.ts']))).toEqual([]);
  });

  it('reports a cycle closed by a re-export', () => {
    writeTree({
      'src/a.ts': `export { b } from './b';\nexport const a = 1;\n`,
      'src/b.ts': `import { a } from './a';\nexport const b = () => a;\n`,
      'src/c.ts': `export * from './d';\nexport const c = 1;\n`,
      'src/d.ts': `import { c } from './c';\nexport const d = () => c;\n`,
    });
    const result = lint(['src/a.ts', 'src/c.ts']);
    expect(result.get('src/a.ts')!.filter((m) => m.ruleId)).toHaveLength(1);
    expect(result.get('src/c.ts')!.filter((m) => m.ruleId)).toHaveLength(1);
  });

  it('resolves a TS-ESM `.js` specifier to its `.ts` source and closes the cycle', () => {
    writeTree({
      'src/a.ts': `import { b } from './b.js';\nexport const a = () => b;\n`,
      'src/b.tsx': `import { a } from './a.js';\nexport const b = () => a;\n`,
    });
    const errors = cycleErrors(lint(['src/a.ts', 'src/b.tsx']));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain('src/b.tsx');
  });

  it('reports a cycle through a directory index file', () => {
    writeTree({
      'src/a.ts': `import { lib } from './lib';\nexport const a = () => lib;\n`,
      'src/lib/index.ts': `import { a } from '../a';\nexport const lib = () => a;\n`,
    });
    const errors = cycleErrors(lint(['src/a.ts']));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('src/lib/index.ts');
  });

  it('ignores an unresolvable relative import without throwing', () => {
    writeTree({
      'src/a.ts': [
        `import { gone } from './does-not-exist';`,
        `import { up } from '../../../../nowhere/at/all.js';`,
        `import lodash from 'lodash';`,
        `export const a = [gone, up, lodash];`,
      ].join('\n'),
    });
    expect(cycleErrors(lint(['src/a.ts']))).toEqual([]);
  });

  it('does not report an acyclic chain', () => {
    writeTree({
      'src/a.ts': `import { b } from './b';\nexport const a = b;\n`,
      'src/b.ts': `import { c } from './c';\nexport const b = c;\n`,
      'src/c.ts': `export const c = 1;\n`,
    });
    expect(cycleErrors(lint(['src/a.ts', 'src/b.ts', 'src/c.ts']))).toEqual([]);
  });
});
