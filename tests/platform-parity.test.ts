// tests/platform-parity.test.ts
//
// Root-level platform parity test suite. Scans the repo for structural
// anti-patterns that break cross-platform compatibility.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const EXCLUDE_DIRS = ['node_modules', 'dist', 'coverage', '.harness', '.git', '.turbo'];
const GLOB_IGNORE = EXCLUDE_DIRS.map((d) => `**/${d}/**`);

// -- Anti-pattern 1: Unix commands in package.json scripts --------------------
describe('no unix commands in package.json scripts', () => {
  const UNIX_SCRIPT_PATTERNS = [/\brm -rf\b/, /\bcp -r\b/, /\bmv /, /\bmkdir -p\b/, /\bchmod\b/];

  const packageJsonPaths = glob.sync('**/package.json', {
    cwd: ROOT,
    ignore: GLOB_IGNORE,
    absolute: true,
  });

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
describe('shell scripts have cross-platform equivalents', () => {
  const shFiles = glob.sync('**/*.sh', {
    cwd: ROOT,
    ignore: GLOB_IGNORE,
    absolute: true,
  });

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

// -- Anti-pattern 3: Hardcoded path separators in .ts source files ------------
describe('no hardcoded path separators in source files', () => {
  // Pattern: indexOf('/word/') or includes('/word/') with forward slash path segments
  const SEPARATOR_PATTERN =
    /\.(indexOf|includes|startsWith|endsWith)\s*\(\s*['"`][^'"`]*\/[a-zA-Z_][a-zA-Z0-9_-]*\/[^'"`]*['"`]\s*\)/g;

  const tsFiles = glob.sync('packages/*/src/**/*.ts', {
    cwd: ROOT,
    ignore: GLOB_IGNORE,
    absolute: true,
  });

  for (const tsFile of tsFiles) {
    const relative = tsFile.replace(ROOT + sep, '');

    it(`${relative} has no hardcoded path separators in string methods`, () => {
      const content = readFileSync(tsFile, 'utf-8');
      const lines = content.split('\n');
      const matches: string[] = [];

      let match;
      SEPARATOR_PATTERN.lastIndex = 0;
      while ((match = SEPARATOR_PATTERN.exec(content)) !== null) {
        // Get approximate line number
        const lineNum = content.substring(0, match.index).split('\n').length;
        // Skip lines with platform-safe suppression comment
        const line = lines[lineNum - 1] ?? '';
        if (line.includes('platform-safe')) continue;
        matches.push(`Line ${lineNum}: ${match[0]}`);
      }

      expect(
        matches,
        `Hardcoded path separators in ${relative}:\n${matches.join('\n')}`
      ).toHaveLength(0);
    });
  }
});

// -- Anti-pattern 4: Unguarded fs.chmodSync calls -----------------------------
describe('no unguarded fs.chmodSync calls', () => {
  const CHMOD_PATTERN = /\.chmodSync\s*\(/g;
  const PLATFORM_GUARD = /process\.platform\s*(!==|===|!=|==)\s*['"]win32['"]/;

  const tsFiles = glob.sync('packages/*/src/**/*.ts', {
    cwd: ROOT,
    ignore: GLOB_IGNORE,
    absolute: true,
  });

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

// -- Anti-pattern 5: exec/execSync with shell strings -------------------------
describe('no exec/execSync with unix shell commands', () => {
  const EXEC_PATTERN = /\b(exec|execSync)\s*\(\s*['"`]/g;
  const UNIX_COMMANDS = /['"`]\s*(?:rm|cp|mv|mkdir|chmod|chown)\b/;

  const tsFiles = glob.sync('packages/*/src/**/*.ts', {
    cwd: ROOT,
    ignore: GLOB_IGNORE,
    absolute: true,
  });

  for (const tsFile of tsFiles) {
    const relative = tsFile.replace(ROOT + sep, '');

    it(`${relative} does not use exec/execSync with unix commands`, () => {
      const content = readFileSync(tsFile, 'utf-8');
      const lines = content.split('\n');
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        EXEC_PATTERN.lastIndex = 0;
        if (EXEC_PATTERN.test(line) && UNIX_COMMANDS.test(line)) {
          violations.push(`Line ${i + 1}: ${line.trim()}`);
        }
      }

      expect(
        violations,
        `exec/execSync with unix commands in ${relative}:\n${violations.join('\n')}`
      ).toHaveLength(0);
    });
  }
});
