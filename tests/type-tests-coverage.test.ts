// tests/type-tests-coverage.test.ts
//
// Guards the type-level test gate (#2473 §2). packages/core and packages/cli
// exclude tests/ from their tsconfig, and vitest strips types without checking
// them, so a TYPE-LEVEL assertion in a test file (expectTypeOf, assertType,
// @ts-expect-error, or a `const x: T = v` line marked `@type-gate`) asserts
// nothing unless that file is type-checked. Each package therefore carries a
// tsconfig.type-tests.json that its `typecheck` script runs.
//
// That file list is itself an instrument that can silently go stale: a new test
// with `expectTypeOf` that nobody adds to it is inert again. This suite fails when
// that happens, when a listed file disappears, or when the `typecheck` script
// stops running the project.

import { describe, it, expect, afterEach } from 'vitest';
import { globSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['packages/core', 'packages/cli'];
const TYPE_ASSERTION = /\bexpectTypeOf\b|\bassertType\b|@ts-expect-error|@type-gate\b/;
const TYPE_TESTS_CONFIG = 'tsconfig.type-tests.json';

interface Coverage {
  /** Test files carrying a type-level assertion that the project does not list. */
  unlisted: string[];
  /** Listed files that do not exist (tsc would error, but say so plainly). */
  missing: string[];
  /** Whether the package `typecheck` script runs the type-tests project. */
  wired: boolean;
}

function typeTestCoverage(pkgDir: string): Coverage {
  const config = JSON.parse(readFileSync(join(pkgDir, TYPE_TESTS_CONFIG), 'utf8')) as {
    files?: string[];
  };
  const listed = new Set((config.files ?? []).map((f) => f.replaceAll('\\', '/')));
  const candidates = globSync('tests/**/*.{ts,tsx}', {
    cwd: pkgDir,
    exclude: (p: string) => p.split(/[\\/]/).includes('fixtures'),
  }).map((f) => f.replaceAll('\\', '/'));
  const unlisted = candidates
    .filter((f) => TYPE_ASSERTION.test(readFileSync(join(pkgDir, f), 'utf8')))
    .filter((f) => !listed.has(f))
    .sort();
  const missing = [...listed].filter((f) => !candidates.includes(f)).sort();
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const wired = (pkg.scripts?.typecheck ?? '').includes(`-p ${TYPE_TESTS_CONFIG}`);
  return { unlisted, missing, wired };
}

describe('type-level test assertions are type-checked', () => {
  for (const pkg of PACKAGES) {
    it(`${pkg}: every type-assertion test file is in ${TYPE_TESTS_CONFIG} and the typecheck script runs it`, () => {
      const coverage = typeTestCoverage(join(ROOT, pkg));
      expect(coverage).toEqual({ unlisted: [], missing: [], wired: true });
    });
  }

  describe('positive control — the guard can fail', () => {
    let dir: string | undefined;
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    });

    function fixture(opts: { listed: string[]; typecheck: string }): string {
      dir = mkdtempSync(join(tmpdir(), 'type-tests-guard-'));
      mkdirSync(join(dir, 'tests', 'nested'), { recursive: true });
      mkdirSync(join(dir, 'tests', 'fixtures'), { recursive: true });
      writeFileSync(join(dir, 'tests', 'a.test.ts'), 'expectTypeOf<1>().toEqualTypeOf<1>();\n');
      writeFileSync(join(dir, 'tests', 'nested', 'b.test.ts'), '// @type-gate\nconst x: 1 = 1;\n');
      writeFileSync(join(dir, 'tests', 'plain.test.ts'), 'expect(1).toBe(1);\n');
      writeFileSync(join(dir, 'tests', 'fixtures', 'f.ts'), '// @ts-expect-error\n');
      writeFileSync(join(dir, TYPE_TESTS_CONFIG), JSON.stringify({ files: opts.listed }));
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ scripts: { typecheck: opts.typecheck } })
      );
      return dir;
    }

    it('reports a type-assertion file that is not listed (and ignores plain tests and fixtures)', () => {
      const pkg = fixture({
        listed: ['tests/a.test.ts'],
        typecheck: `tsc --noEmit && tsc -p ${TYPE_TESTS_CONFIG}`,
      });
      expect(typeTestCoverage(pkg)).toEqual({
        unlisted: ['tests/nested/b.test.ts'],
        missing: [],
        wired: true,
      });
    });

    it('reports a listed file that no longer exists', () => {
      const pkg = fixture({
        listed: ['tests/a.test.ts', 'tests/nested/b.test.ts', 'tests/gone.test.ts'],
        typecheck: `tsc --noEmit && tsc -p ${TYPE_TESTS_CONFIG}`,
      });
      expect(typeTestCoverage(pkg).missing).toEqual(['tests/gone.test.ts']);
    });

    it('reports a typecheck script that does not run the type-tests project', () => {
      const pkg = fixture({
        listed: ['tests/a.test.ts', 'tests/nested/b.test.ts'],
        typecheck: 'tsc --noEmit',
      });
      expect(typeTestCoverage(pkg).wired).toBe(false);
    });
  });
});
