// tests/rules/require-path-normalization.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/require-path-normalization';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('require-path-normalization', rule, {
  valid: [
    // Normalized with replaceAll('\\', '/')
    { code: `const rel = relative(rootDir, file).replaceAll('\\\\', '/');` },
    // Normalized with replace regex
    { code: `const rel = relative(rootDir, file).replace(/\\\\\\\\/g, '/');` },
    // path.relative with replaceAll
    { code: `const rel = path.relative(rootDir, file).replaceAll('\\\\', '/');` },
    // path.relative with replace regex
    { code: `const rel = path.relative(rootDir, file).replace(/\\\\\\\\/g, '/');` },
    // Inline in map with normalization
    { code: `files.map(f => relative(rootDir, f).replaceAll('\\\\', '/'));` },
    // Not a relative call (different function name)
    { code: `const rel = resolve(rootDir, file);` },
    // Not a relative call (different object)
    { code: `const rel = url.relative(base, target);` },
  ],
  invalid: [
    // Bare relative() call
    {
      code: `const rel = relative(rootDir, file);`,
      errors: [{ messageId: 'missingNormalization' }],
    },
    // Bare path.relative() call
    {
      code: `const rel = path.relative(rootDir, file);`,
      errors: [{ messageId: 'missingNormalization' }],
    },
    // Inline in map without normalization
    {
      code: `files.map(f => relative(rootDir, f));`,
      errors: [{ messageId: 'missingNormalization' }],
    },
    // Inline in template literal
    {
      code: `const msg = \`path: \${relative(rootDir, file)}\`;`,
      errors: [{ messageId: 'missingNormalization' }],
    },
    // Chained with wrong method (not replace/replaceAll)
    {
      code: `const rel = relative(rootDir, file).trim();`,
      errors: [{ messageId: 'missingNormalization' }],
    },
    // Chained with replace but wrong arguments — does NOT normalize backslashes
    {
      code: `const rel = relative(rootDir, file).replace('foo', 'bar');`,
      errors: [{ messageId: 'missingNormalization' }],
    },
    // Chained with replaceAll but wrong arguments
    {
      code: `const rel = relative(rootDir, file).replaceAll('x', 'y');`,
      errors: [{ messageId: 'missingNormalization' }],
    },
  ],
});
