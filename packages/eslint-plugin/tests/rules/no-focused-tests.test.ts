import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-focused-tests';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-focused-tests', rule, {
  valid: [
    // Regular describe, it, test calls
    { code: `describe('suite', () => {});` },
    { code: `it('test', () => {});` },
    { code: `test('test', () => {});` },
    // Regular function calls
    { code: `console.log('hello');` },
    { code: `someFunction();` },
    // Nested calls with .only
    { code: `describe('suite', () => { it('test', () => {}); });` },
  ],
  invalid: [
    // describe.only()
    {
      code: `describe.only('suite', () => {});`,
      errors: [{ messageId: 'focusedTest' }],
    },
    // it.only()
    {
      code: `it.only('test', () => {});`,
      errors: [{ messageId: 'focusedTest' }],
    },
    // test.only()
    {
      code: `test.only('test', () => {});`,
      errors: [{ messageId: 'focusedTest' }],
    },
    // fdescribe()
    {
      code: `fdescribe('suite', () => {});`,
      errors: [{ messageId: 'focusedTest' }],
    },
    // fit()
    {
      code: `fit('test', () => {});`,
      errors: [{ messageId: 'focusedTest' }],
    },
  ],
});
