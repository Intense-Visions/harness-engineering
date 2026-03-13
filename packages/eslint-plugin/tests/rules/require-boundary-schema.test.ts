// tests/rules/require-boundary-schema.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import rule from '../../src/rules/require-boundary-schema';
import { clearConfigCache } from '../../src/utils/config-loader';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const fixturesDir = path.join(__dirname, '../fixtures');

beforeEach(() => {
  clearConfigCache();
});

ruleTester.run('require-boundary-schema', rule, {
  valid: [
    // Has schema.parse()
    {
      code: `
export function handler(input: unknown) {
  const data = schema.parse(input);
  return data;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
    },
    // Has z.object().parse()
    {
      code: `
export function handler(input: unknown) {
  const data = z.object({ name: z.string() }).parse(input);
  return data;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
    },
    // Has safeParse()
    {
      code: `
export function handler(input: unknown) {
  const result = UserSchema.safeParse(input);
  if (!result.success) throw new Error('Invalid');
  return result.data;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
    },
    // Non-API file - not checked
    {
      code: `export function helper() { return 1; }`,
      filename: path.join(fixturesDir, 'src/utils/helper.ts'),
    },
    // No config - rule is no-op
    {
      code: `export function anything() {}`,
      filename: '/no-config/file.ts',
    },
  ],
  invalid: [
    // Missing validation
    {
      code: `
export function handler(input: unknown) {
  return input;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
      errors: [{ messageId: 'missingSchema' }],
    },
    // Has Zod import but doesn't use it
    {
      code: `
import { z } from 'zod';
export function handler(input: unknown) {
  return input;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
      errors: [{ messageId: 'missingSchema' }],
    },
  ],
});
