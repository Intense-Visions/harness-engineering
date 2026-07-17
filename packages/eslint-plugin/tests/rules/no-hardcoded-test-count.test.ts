import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-hardcoded-test-count';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-hardcoded-test-count', rule, {
  valid: [
    // toHaveLength with variable
    { code: `expect(rules).toHaveLength(expected);` },
    { code: `expect(rules).toHaveLength(someFunction());` },

    // toBe with variable (length)
    { code: `expect(x.length).toBe(expected);` },
    { code: `expect(x.length).toBe(someFunction());` },
    { code: `expect(x.length).toBe(items.length);` },

    // Other valid test patterns
    { code: `describe('suite', () => {});` },
    { code: `it('test', () => {});` },
    { code: `test('test', () => {});` },
    { code: `console.log('hello');` },
    { code: `someFunction();` },
  ],
  invalid: [
    // toHaveLength with numeric literal
    {
      code: `expect(rules).toHaveLength(12);`,
      errors: [{ messageId: 'hardcodedTestCount' }],
    },
    {
      code: `expect(rules).toHaveLength(5);`,
      errors: [{ messageId: 'hardcodedTestCount' }],
    },

    // toBe with numeric literal (length)
    {
      code: `expect(x.length).toBe(5);`,
      errors: [{ messageId: 'hardcodedTestCount' }],
    },
    {
      code: `expect(items.length).toBe(10);`,
      errors: [{ messageId: 'hardcodedTestCount' }],
    },
  ],
});
