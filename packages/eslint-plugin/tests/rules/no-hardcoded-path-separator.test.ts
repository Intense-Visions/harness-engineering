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
