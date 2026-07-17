import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-skipped-tests';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-skipped-tests', rule, {
  valid: [
    // Regular describe, it, test calls
    { code: `describe('suite', () => {});` },
    { code: `it('test', () => {});` },
    { code: `test('test', () => {});` },
    // Regular function calls
    { code: `console.log('hello');` },
    { code: `someFunction();` },
    // Nested calls with .skip (should be valid)
    { code: `describe('suite', () => { it('test', () => {}); });` },
  ],
  invalid: [
    // describe.skip()
    {
      code: `describe.skip('suite', () => {});`,
      errors: [{ messageId: 'skippedTest' }],
    },
    // it.skip()
    {
      code: `it.skip('test', () => {});`,
      errors: [{ messageId: 'skippedTest' }],
    },
    // test.skip()
    {
      code: `test.skip('test', () => {});`,
      errors: [{ messageId: 'skippedTest' }],
    },
    // xdescribe()
    {
      code: `xdescribe('suite', () => {});`,
      errors: [{ messageId: 'skippedTest' }],
    },
    // xit()
    {
      code: `xit('test', () => {});`,
      errors: [{ messageId: 'skippedTest' }],
    },
    // xtest()
    {
      code: `xtest('test', () => {});`,
      errors: [{ messageId: 'skippedTest' }],
    },
  ],
});
