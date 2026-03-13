// tests/rules/enforce-doc-exports.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/enforce-doc-exports';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('enforce-doc-exports', rule, {
  valid: [
    // Function with JSDoc
    {
      code: `
/** Does something */
export function foo() {}
`,
    },
    // Class with JSDoc
    {
      code: `
/** A class */
export class Foo {}
`,
    },
    // Const with JSDoc
    {
      code: `
/** A constant */
export const FOO = 1;
`,
    },
    // Internal export (default ignoreInternal: true)
    {
      code: `
/** @internal */
export function internal() {}
`,
    },
    // Non-exported function (no JSDoc needed)
    {
      code: `function notExported() {}`,
    },
  ],
  invalid: [
    // Missing JSDoc on function
    {
      code: `export function foo() {}`,
      errors: [{ messageId: 'missingJSDoc' }],
    },
    // Missing JSDoc on class
    {
      code: `export class Foo {}`,
      errors: [{ messageId: 'missingJSDoc' }],
    },
    // Missing JSDoc on const
    {
      code: `export const FOO = 1;`,
      errors: [{ messageId: 'missingJSDoc' }],
    },
    // Regular comment doesn't count
    {
      code: `
// Not JSDoc
export function foo() {}
`,
      errors: [{ messageId: 'missingJSDoc' }],
    },
  ],
});
