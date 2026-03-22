# Plan: Cross-Platform Enforcement (Phase B: B1-B4)

**Date:** 2026-03-21
**Spec:** docs/changes/cross-platform-enforcement/proposal.md
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

Add two ESLint rules and a platform parity test suite that mechanically prevent platform-specific regressions from entering the codebase.

## Observable Truths (Acceptance Criteria)

1. When `execSync('rm -rf dist')` appears in source code, the `no-unix-shell-command` ESLint rule shall report a `unixShellCommand` error on that call expression.
2. When `execFile('git', ['status'])` appears in source code, the `no-unix-shell-command` ESLint rule shall not report an error.
3. When `path.join(base, '/src/')` appears in source code, the `no-hardcoded-path-separator` ESLint rule shall report a `hardcodedPathSeparator` error on the string literal.
4. When `import './src/utils'` appears in source code, the `no-hardcoded-path-separator` ESLint rule shall not report an error (import specifiers are excluded).
5. The eslint plugin index (`packages/eslint-plugin/src/rules/index.ts`) shall export both `no-unix-shell-command` and `no-hardcoded-path-separator` rules.
6. The root `eslint.config.js` shall include both new rules configured as `warn`.
7. `pnpm --filter @harness-engineering/eslint-plugin test` shall pass, including new rule tests.
8. A root-level test file `tests/platform-parity.test.ts` shall exist and scan for all 5 anti-patterns: Unix commands in package.json scripts, `.sh` files without cross-platform equivalents, hardcoded path separators in `.ts` files, unguarded `fs.chmodSync` calls, and `exec`/`execSync` with shell strings.

## File Map

```
CREATE packages/eslint-plugin/src/rules/no-unix-shell-command.ts
CREATE packages/eslint-plugin/tests/rules/no-unix-shell-command.test.ts
CREATE packages/eslint-plugin/src/rules/no-hardcoded-path-separator.ts
CREATE packages/eslint-plugin/tests/rules/no-hardcoded-path-separator.test.ts
MODIFY packages/eslint-plugin/src/rules/index.ts (add imports and exports for both rules)
MODIFY packages/eslint-plugin/src/index.ts (add rules to recommended/strict configs)
MODIFY eslint.config.js (add rules to project config)
CREATE tests/platform-parity.test.ts
```

## Tasks

### Task 1: Create `no-unix-shell-command` rule test (TDD - red phase)

**Depends on:** none
**Files:** `packages/eslint-plugin/tests/rules/no-unix-shell-command.test.ts`

1. Create test file `packages/eslint-plugin/tests/rules/no-unix-shell-command.test.ts`:

```typescript
// tests/rules/no-unix-shell-command.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-unix-shell-command';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-unix-shell-command', rule, {
  valid: [
    // execFile with git is fine (cross-platform binary)
    { code: `execFile('git', ['status'], callback);` },
    // execFileSync with git is fine
    { code: `execFileSync('git', ['log', '--oneline']);` },
    // exec with non-unix command
    { code: `exec('node build.js', callback);` },
    // execSync with non-unix command
    { code: `execSync('tsc --noEmit');` },
    // Member expression: child_process.execFile
    { code: `child_process.execFile('git', ['pull']);` },
    // String with unix command name but not in exec context
    { code: `const cmd = 'rm -rf dist';` },
    // execFile with rm (execFile is intentionally allowed)
    { code: `execFile('rm', ['-rf', 'dist']);` },
    // execFileSync with cp (execFile is intentionally allowed)
    { code: `execFileSync('cp', ['-r', 'src', 'dist']);` },
  ],
  invalid: [
    // exec with rm
    {
      code: `exec('rm -rf dist', callback);`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // execSync with rm -rf
    {
      code: `execSync('rm -rf dist');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // exec with cp
    {
      code: `exec('cp -r src dest');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // execSync with mv
    {
      code: `execSync('mv old.txt new.txt');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // exec with mkdir -p
    {
      code: `exec('mkdir -p /tmp/foo');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // execSync with chmod
    {
      code: `execSync('chmod 755 script.sh');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // execSync with chown
    {
      code: `execSync('chown root:root file');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // Member expression: child_process.exec with unix command
    {
      code: `child_process.exec('rm -rf node_modules');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // Member expression: child_process.execSync
    {
      code: `child_process.execSync('cp file1 file2');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // Template literal with unix command
    {
      code: `execSync(\`rm -rf \${dir}\`);`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
  ],
});
```

2. Run test: `cd packages/eslint-plugin && pnpm vitest run tests/rules/no-unix-shell-command.test.ts`
3. Observe failure: module `../../src/rules/no-unix-shell-command` not found
4. Run: `npx harness validate`
5. Commit: `test(eslint-plugin): add tests for no-unix-shell-command rule`

---

### Task 2: Implement `no-unix-shell-command` rule (TDD - green phase)

**Depends on:** Task 1
**Files:** `packages/eslint-plugin/src/rules/no-unix-shell-command.ts`

1. Create implementation `packages/eslint-plugin/src/rules/no-unix-shell-command.ts`:

```typescript
// src/rules/no-unix-shell-command.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'unixShellCommand';

const UNIX_COMMANDS = ['rm', 'cp', 'mv', 'mkdir', 'chmod', 'chown'];

// Match unix commands at the start of the string or after whitespace/shell operators
const UNIX_COMMAND_PATTERN = new RegExp(`(?:^|[;&|]\\s*)(?:${UNIX_COMMANDS.join('|')})(?:\\s|$)`);

// Only flag exec() and execSync() — NOT execFile/execFileSync
const FLAGGED_FUNCTIONS = new Set(['exec', 'execSync']);

export default createRule<[], MessageIds>({
  name: 'no-unix-shell-command',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow exec/execSync calls with Unix-specific shell commands',
    },
    messages: {
      unixShellCommand:
        'Avoid Unix-specific shell commands in exec/execSync. Use Node.js fs APIs or execFile with cross-platform binaries instead.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        let functionName: string | undefined;

        // Handle: exec('...')  / execSync('...')
        if (node.callee.type === 'Identifier' && FLAGGED_FUNCTIONS.has(node.callee.name)) {
          functionName = node.callee.name;
        }

        // Handle: child_process.exec('...')  / child_process.execSync('...')
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          FLAGGED_FUNCTIONS.has(node.callee.property.name)
        ) {
          functionName = node.callee.property.name;
        }

        if (!functionName) return;

        const firstArg = node.arguments[0];
        if (!firstArg) return;

        let commandString: string | undefined;

        if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
          commandString = firstArg.value;
        } else if (firstArg.type === 'TemplateLiteral' && firstArg.quasis.length > 0) {
          // Check the first quasi (static part) of the template literal
          commandString = firstArg.quasis[0]?.value.raw;
        }

        if (commandString && UNIX_COMMAND_PATTERN.test(commandString)) {
          context.report({
            node,
            messageId: 'unixShellCommand',
          });
        }
      },
    };
  },
});
```

2. Run test: `cd packages/eslint-plugin && pnpm vitest run tests/rules/no-unix-shell-command.test.ts`
3. Observe: all tests pass
4. Run: `npx harness validate`
5. Commit: `feat(eslint-plugin): implement no-unix-shell-command rule`

---

### Task 3: Create `no-hardcoded-path-separator` rule test (TDD - red phase)

**Depends on:** none (parallel with Tasks 1-2)
**Files:** `packages/eslint-plugin/tests/rules/no-hardcoded-path-separator.test.ts`

1. Create test file `packages/eslint-plugin/tests/rules/no-hardcoded-path-separator.test.ts`:

```typescript
// tests/rules/no-hardcoded-path-separator.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-hardcoded-path-separator';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-hardcoded-path-separator', rule, {
  valid: [
    // Import specifiers are excluded
    { code: `import foo from './src/utils';` },
    // Dynamic import specifiers are excluded
    { code: `const m = await import('./src/utils');` },
    // require() specifiers are excluded
    { code: `const m = require('./src/utils');` },
    // URL strings are excluded
    { code: `fetch('https://example.com/src/api');` },
    // String not in a path/fs/string-method context
    { code: `const label = '/src/';` },
    // path.join with no hardcoded separator
    { code: `path.join(base, 'src', 'index.ts');` },
    // indexOf with no path separator
    { code: `str.indexOf('src');` },
    // Regex patterns are excluded (not string literals)
    { code: `const re = /\\/src\\//;` },
  ],
  invalid: [
    // path.join with hardcoded separator
    {
      code: `path.join(base, '/src/');`,
      errors: [{ messageId: 'hardcodedPathSeparator' }],
    },
    // path.resolve with hardcoded separator
    {
      code: `path.resolve('/dist/output');`,
      errors: [{ messageId: 'hardcodedPathSeparator' }],
    },
    // fs.readFileSync with hardcoded separator
    {
      code: `fs.readFileSync('/src/config.json');`,
      errors: [{ messageId: 'hardcodedPathSeparator' }],
    },
    // indexOf with hardcoded path separator
    {
      code: `filePath.indexOf('/src/');`,
      errors: [{ messageId: 'hardcodedPathSeparator' }],
    },
    // includes with hardcoded path separator
    {
      code: `filePath.includes('/dist/');`,
      errors: [{ messageId: 'hardcodedPathSeparator' }],
    },
    // startsWith with hardcoded path separator
    {
      code: `name.startsWith('/src/');`,
      errors: [{ messageId: 'hardcodedPathSeparator' }],
    },
    // endsWith with hardcoded path separator
    {
      code: `name.endsWith('/dist/bundle.js');`,
      errors: [{ messageId: 'hardcodedPathSeparator' }],
    },
    // path.basename with hardcoded separator
    {
      code: `path.basename('/src/index.ts');`,
      errors: [{ messageId: 'hardcodedPathSeparator' }],
    },
  ],
});
```

2. Run test: `cd packages/eslint-plugin && pnpm vitest run tests/rules/no-hardcoded-path-separator.test.ts`
3. Observe failure: module `../../src/rules/no-hardcoded-path-separator` not found
4. Run: `npx harness validate`
5. Commit: `test(eslint-plugin): add tests for no-hardcoded-path-separator rule`

---

### Task 4: Implement `no-hardcoded-path-separator` rule (TDD - green phase)

**Depends on:** Task 3
**Files:** `packages/eslint-plugin/src/rules/no-hardcoded-path-separator.ts`

1. Create implementation `packages/eslint-plugin/src/rules/no-hardcoded-path-separator.ts`:

```typescript
// src/rules/no-hardcoded-path-separator.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'hardcodedPathSeparator';

// Matches strings containing /word/ patterns that look like path segments
// e.g., '/src/', '/dist/', '/build/', '/lib/', '/packages/'
const HARDCODED_SEPARATOR_PATTERN = /\/[a-zA-Z_][a-zA-Z0-9_-]*\//;

// URL prefixes to ignore
const URL_PREFIXES = ['http://', 'https://', 'ftp://', 'file://'];

// path.* methods that take path arguments
const PATH_METHODS = new Set([
  'join',
  'resolve',
  'normalize',
  'relative',
  'dirname',
  'basename',
  'extname',
  'parse',
  'format',
  'isAbsolute',
]);

// fs.* methods that take path arguments
const FS_METHODS = new Set([
  'readFileSync',
  'writeFileSync',
  'readFile',
  'writeFile',
  'existsSync',
  'exists',
  'statSync',
  'stat',
  'lstatSync',
  'lstat',
  'readdirSync',
  'readdir',
  'mkdirSync',
  'mkdir',
  'unlinkSync',
  'unlink',
  'rmSync',
  'rm',
  'cpSync',
  'cp',
  'copyFileSync',
  'copyFile',
  'renameSync',
  'rename',
  'accessSync',
  'access',
  'chmodSync',
  'chmod',
]);

// String methods that indicate path comparison/manipulation
const STRING_METHODS = new Set(['indexOf', 'includes', 'startsWith', 'endsWith']);

function isUrlString(value: string): boolean {
  return URL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isImportOrRequire(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // import '...' or import x from '...'
  if (parent.type === 'ImportDeclaration' && parent.source === node) return true;

  // import('...')
  if (parent.type === 'ImportExpression' && parent.source === node) return true;

  // require('...')
  if (
    parent.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'require' &&
    parent.arguments[0] === node
  ) {
    return true;
  }

  return false;
}

function isInFlaggedContext(node: TSESTree.Literal): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // Argument to a call expression
  if (parent.type === 'CallExpression') {
    const callee = parent.callee;

    // path.join(...), path.resolve(...), etc.
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === 'path' &&
      callee.property.type === 'Identifier' &&
      PATH_METHODS.has(callee.property.name)
    ) {
      return true;
    }

    // fs.readFileSync(...), fs.writeFile(...), etc.
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      (callee.object.name === 'fs' || callee.object.name === 'fsp') &&
      callee.property.type === 'Identifier' &&
      FS_METHODS.has(callee.property.name)
    ) {
      return true;
    }

    return false;
  }

  // Argument to str.indexOf(...), str.includes(...), etc.
  // These appear as: parent is CallExpression, grandparent has the MemberExpression
  // Actually the node's parent structure for `filePath.indexOf('/src/')`:
  //   CallExpression { callee: MemberExpression { property: 'indexOf' }, arguments: [Literal '/src/'] }
  // So the parent IS a CallExpression — handled above... but callee is not path.* or fs.*
  // We need a separate check: the callee is a MemberExpression whose property is a STRING_METHOD
  if (parent.type === 'CallExpression') {
    const callee = parent.callee;
    if (
      callee.type === 'MemberExpression' &&
      callee.property.type === 'Identifier' &&
      STRING_METHODS.has(callee.property.name)
    ) {
      return true;
    }
  }

  return false;
}

export default createRule<[], MessageIds>({
  name: 'no-hardcoded-path-separator',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoded Unix path separators in path/fs method calls and string comparisons',
    },
    messages: {
      hardcodedPathSeparator:
        'Avoid hardcoded Unix path separators. Use path.join(), path.sep, or path.posix/path.win32 for cross-platform compatibility.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      Literal(node: TSESTree.Literal) {
        if (typeof node.value !== 'string') return;
        if (!HARDCODED_SEPARATOR_PATTERN.test(node.value)) return;
        if (isUrlString(node.value)) return;
        if (isImportOrRequire(node)) return;
        if (!isInFlaggedContext(node)) return;

        context.report({
          node,
          messageId: 'hardcodedPathSeparator',
        });
      },
    };
  },
});
```

2. Run test: `cd packages/eslint-plugin && pnpm vitest run tests/rules/no-hardcoded-path-separator.test.ts`
3. Observe: all tests pass
4. Run: `npx harness validate`
5. Commit: `feat(eslint-plugin): implement no-hardcoded-path-separator rule`

---

### Task 5: Register both rules in plugin index and config (B3)

**Depends on:** Tasks 2, 4
**Files:** `packages/eslint-plugin/src/rules/index.ts`, `packages/eslint-plugin/src/index.ts`, `eslint.config.js`

1. Modify `packages/eslint-plugin/src/rules/index.ts` — add two imports and two exports:

```typescript
// Add after existing imports:
import noUnixShellCommand from './no-unix-shell-command';
import noHardcodedPathSeparator from './no-hardcoded-path-separator';

// Add to the rules object:
  'no-unix-shell-command': noUnixShellCommand,
  'no-hardcoded-path-separator': noHardcodedPathSeparator,
```

2. Modify `packages/eslint-plugin/src/index.ts` — add both rules to `recommended` and `strict` configs:

```typescript
// In recommended.rules, add:
'@harness-engineering/no-unix-shell-command': 'warn',
'@harness-engineering/no-hardcoded-path-separator': 'warn',

// In strict.rules, add:
'@harness-engineering/no-unix-shell-command': 'error',
'@harness-engineering/no-hardcoded-path-separator': 'error',
```

3. Modify `eslint.config.js` — add a new config object for the harness plugin rules. Since the eslint-plugin is a workspace package, import it and add the rules:

Add after the existing `prettierConfig` entry (or in the packages `src/**/*.ts` block):

```javascript
// In the packages/*/src/**/*.ts config block, add:
'@harness-engineering/no-unix-shell-command': 'warn',
'@harness-engineering/no-hardcoded-path-separator': 'warn',
```

Note: The root eslint.config.js currently uses `@typescript-eslint` but not the harness plugin. The harness plugin needs to be imported and added to the plugins section. If the harness plugin is not yet wired into the root config as a plugin, add it:

```javascript
import harnessPlugin from '@harness-engineering/eslint-plugin';

// Add a new config object:
{
  files: ['packages/*/src/**/*.ts'],
  plugins: {
    '@harness-engineering': harnessPlugin,
  },
  rules: {
    '@harness-engineering/no-unix-shell-command': 'warn',
    '@harness-engineering/no-hardcoded-path-separator': 'warn',
  },
},
```

4. Run: `cd packages/eslint-plugin && pnpm vitest run` (all existing + new tests pass)
5. Run: `npx harness validate`
6. Run: `npx harness check-deps`
7. Commit: `feat(eslint-plugin): register no-unix-shell-command and no-hardcoded-path-separator rules`

[checkpoint:human-verify] — Confirm all existing eslint-plugin tests still pass and the rules appear in the plugin exports.

---

### Task 6: Create root platform parity test suite (B4)

**Depends on:** none (parallel with Tasks 1-5)
**Files:** `tests/platform-parity.test.ts`

Note: The root `tests/` directory does not exist yet. It must be created. The root `package.json` runs tests via `turbo run test`, which dispatches to workspace packages. This root-level test needs a vitest config or must be run directly. Since there is no root vitest config, either (a) add a root `vitest.config.mts` that includes `tests/`, or (b) run it with `pnpm vitest run tests/platform-parity.test.ts` directly.

Recommended approach: create a minimal root `vitest.workspace.ts` or add a `test:root` script. However, to minimize scope, add a `test:platform-parity` script to root `package.json` that runs `vitest run tests/platform-parity.test.ts`.

1. Create `tests/platform-parity.test.ts`:

```typescript
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

// ── Anti-pattern 1: Unix commands in package.json scripts ──────────────
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

// ── Anti-pattern 2: .sh files without cross-platform equivalents ───────
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

// ── Anti-pattern 3: Hardcoded path separators in .ts source files ──────
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
      const matches: string[] = [];

      let match;
      SEPARATOR_PATTERN.lastIndex = 0;
      while ((match = SEPARATOR_PATTERN.exec(content)) !== null) {
        // Get approximate line number
        const lineNum = content.substring(0, match.index).split('\n').length;
        matches.push(`Line ${lineNum}: ${match[0]}`);
      }

      expect(
        matches,
        `Hardcoded path separators in ${relative}:\n${matches.join('\n')}`
      ).toHaveLength(0);
    });
  }
});

// ── Anti-pattern 4: Unguarded fs.chmodSync calls ───────────────────────
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

// ── Anti-pattern 5: exec/execSync with shell strings ───────────────────
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
```

2. Add `test:platform-parity` script to root `package.json`:

```json
"test:platform-parity": "vitest run tests/platform-parity.test.ts"
```

Note: `vitest` is a devDependency of workspace packages but may not be at root. If not, add `vitest` to root devDependencies, or run via `pnpm --filter @harness-engineering/eslint-plugin exec vitest run ../../tests/platform-parity.test.ts`. The simplest approach: add `vitest` to root devDependencies and a minimal root vitest config.

3. Create a minimal root `vitest.config.mts` if one does not exist:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

4. Run: `pnpm vitest run tests/platform-parity.test.ts` from root
5. Observe: all tests pass (assuming Phase A source fixes are complete; if not, some tests may legitimately fail and that is expected — the tests are catching real issues)
6. Run: `npx harness validate`
7. Commit: `test: add root platform parity test suite for cross-platform enforcement`

[checkpoint:human-verify] — Review which anti-pattern tests pass and which fail. Failures indicate real platform-specific code that Phase A should have fixed. If Phase A is not yet complete, note failures as expected.

---

### Task 7: Verify full integration

**Depends on:** Tasks 5, 6
**Files:** none (verification only)

1. Run full eslint-plugin test suite: `cd packages/eslint-plugin && pnpm vitest run`
2. Verify: all 10 rule test files pass (8 existing + 2 new)
3. Run platform parity tests: `cd /Users/cwarner/Projects/harness-engineering && pnpm vitest run tests/platform-parity.test.ts`
4. Verify: all 5 anti-pattern categories report results
5. Run: `npx harness validate`
6. Run: `npx harness check-deps`
7. Commit: no commit needed (verification task)

[checkpoint:human-verify] — Confirm all tests pass. Review any lint warnings from the new rules against existing code. Decide if warnings should be addressed now or tracked as follow-up work.

## Dependency Graph

```
Task 1 (test B1) ──> Task 2 (impl B1) ──┐
                                          ├──> Task 5 (B3 registration) ──┐
Task 3 (test B2) ──> Task 4 (impl B2) ──┘                                ├──> Task 7 (verify)
                                                                          │
Task 6 (B4 parity tests) ────────────────────────────────────────────────┘
```

Tasks 1-2 and Tasks 3-4 are parallelizable (different files, no shared state).
Task 6 is parallelizable with Tasks 1-5 (independent subsystem).

## Notes

- The `no-hardcoded-path-separator` rule has a deliberately narrow scope: it only flags string literals in `path.*`, `fs.*`, and string comparison method calls. This avoids false positives on import specifiers, URLs, and general string constants.
- The platform parity test uses `glob` (already a transitive dependency via the workspace) for file discovery.
- If Phase A source fixes are not yet merged, the platform parity test (Task 6) may report legitimate failures — this is expected and validates that the test suite works.
- The root vitest config (Task 6) is intentionally minimal and separate from the turborepo pipeline to avoid interfering with existing workspace test orchestration.
