// tests/platform-parity.test.ts
//
// Root-level platform parity test suite. Scans the repo for structural
// anti-patterns that break cross-platform compatibility.
//
// NOTE: Code-level checks (hardcoded path separators, exec with unix commands,
// unnormalized relative() calls) are enforced by ESLint rules that run on every
// commit via lint-staged. This file only covers structural/JSON checks that
// ESLint cannot handle.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, globSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const EXCLUDE_DIRS = ['node_modules', 'dist', 'coverage', '.harness', '.git', '.turbo', '.husky'];
const GLOB_EXCLUDE = EXCLUDE_DIRS.map((d) => `**/${d}/**`);

function findFiles(pattern: string): string[] {
  return globSync(pattern, { cwd: ROOT, exclude: GLOB_EXCLUDE }).map((f) => resolve(ROOT, f));
}

// -- Anti-pattern 1: Unix commands in package.json scripts --------------------
// ESLint can't check JSON files, so this stays as a test.
describe('no unix commands in package.json scripts', () => {
  const UNIX_SCRIPT_PATTERNS = [/\brm -rf\b/, /\bcp -r\b/, /\bmv /, /\bmkdir -p\b/, /\bchmod\b/];

  const packageJsonPaths = findFiles('**/package.json');

  for (const pkgPath of packageJsonPaths) {
    const relative = pkgPath.replace(ROOT + sep, '');

    it(`${relative} has no Unix commands in scripts`, () => {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const scripts = pkg.scripts ?? {};
      const violations: string[] = [];

      for (const [name, value] of Object.entries(scripts)) {
        if (typeof value !== 'string') continue;
        for (const pattern of UNIX_SCRIPT_PATTERNS) {
          if (pattern.test(value)) {
            violations.push(`scripts.${name}: "${value}" matches ${pattern}`);
          }
        }
      }

      expect(
        violations,
        `Unix commands found in ${relative}:\n${violations.join('\n')}`
      ).toHaveLength(0);
    });
  }
});

// -- Anti-pattern 2: .sh files without cross-platform equivalents -------------
// Structural check — ESLint can't verify cross-file equivalents exist.
describe('shell scripts have cross-platform equivalents', () => {
  const shFiles = findFiles('**/*.sh').filter(
    (f) => !f.includes('husky') && !f.includes('docker-') // Docker scripts are Linux-only by design
  );

  if (shFiles.length === 0) {
    it('no .sh files found (nothing to check)', () => {
      expect(true).toBe(true);
    });
  }

  for (const shFile of shFiles) {
    const relative = shFile.replace(ROOT + sep, '');
    const base = shFile.replace(/\.sh$/, '');

    it(`${relative} has a cross-platform equivalent (.mjs, .ts, or .js)`, () => {
      const hasEquivalent =
        existsSync(`${base}.mjs`) || existsSync(`${base}.ts`) || existsSync(`${base}.js`);

      expect(
        hasEquivalent,
        `${relative} has no cross-platform equivalent. Add a .mjs/.ts/.js version.`
      ).toBe(true);
    });
  }
});

// -- Anti-pattern 3: Unguarded fs.chmodSync calls -----------------------------
// Context-aware check (5-line lookback for platform guard) — too complex for ESLint AST.
describe('no unguarded fs.chmodSync calls', () => {
  const CHMOD_PATTERN = /\.chmodSync\s*\(/g;
  const PLATFORM_GUARD = /process\.platform\s*(!==|===|!=|==)\s*['"]win32['"]/;

  const tsFiles = findFiles('packages/*/src/**/*.ts');

  for (const tsFile of tsFiles) {
    const relative = tsFile.replace(ROOT + sep, '');

    it(`${relative} guards chmodSync with platform check`, () => {
      const content = readFileSync(tsFile, 'utf-8');
      const lines = content.split('\n');
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (CHMOD_PATTERN.test(lines[i]!)) {
          CHMOD_PATTERN.lastIndex = 0;
          // Check surrounding 5 lines for a platform guard
          const context = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
          if (!PLATFORM_GUARD.test(context)) {
            violations.push(`Line ${i + 1}: ${lines[i]!.trim()}`);
          }
        }
      }

      expect(
        violations,
        `Unguarded chmodSync in ${relative}:\n${violations.join('\n')}`
      ).toHaveLength(0);
    });
  }
});

// Anti-patterns 4-6 (hardcoded path separators, exec with unix commands,
// unnormalized relative() calls) are enforced by ESLint rules:
//   - @harness-engineering/no-hardcoded-path-separator
//   - @harness-engineering/no-unix-shell-command
//   - @harness-engineering/require-path-normalization
// These run per-file on every commit via lint-staged, catching issues faster
// than this test suite which scans the entire repo.
