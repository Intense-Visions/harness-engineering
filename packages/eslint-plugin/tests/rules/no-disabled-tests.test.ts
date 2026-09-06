import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-disabled-tests';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-disabled-tests', rule, {
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
    // Playwright namespaced calls that are NOT muted
    { code: `test.describe('suite', () => {});` },
    { code: `test.describe.serial('suite', () => {});` },
    { code: `test.describe.parallel('suite', () => {});` },
    // A .skip whose chain root is not a known test global — not our business
    { code: `rateLimiter.skip('token', () => {});` },
    { code: `queue.batch.skip();` },
    // Identifiers named skip that are not related to tests
    { code: `const skip = 'something';` },
    { code: `function skip() {}` },
    { code: `const obj = { skip: 'value' };` },
  ],
  invalid: [
    // describe.skip()
    {
      code: `describe.skip('suite', () => {});`,
      errors: [{ messageId: 'disabledTest' }],
    },
    // it.skip()
    {
      code: `it.skip('test', () => {});`,
      errors: [{ messageId: 'disabledTest' }],
    },
    // test.skip()
    {
      code: `test.skip('test', () => {});`,
      errors: [{ messageId: 'disabledTest' }],
    },
    // xdescribe()
    {
      code: `xdescribe('suite', () => {});`,
      errors: [{ messageId: 'disabledTest' }],
    },
    // xit()
    {
      code: `xit('test', () => {});`,
      errors: [{ messageId: 'disabledTest' }],
    },
    // xtest()
    {
      code: `xtest('test', () => {});`,
      errors: [{ messageId: 'disabledTest' }],
    },
    // Playwright: test.describe.skip() mutes an ENTIRE block — the callee's
    // object is a MemberExpression (`test.describe`), not an Identifier. #1812
    {
      code: `test.describe.skip('suite', () => {});`,
      errors: [{ messageId: 'disabledTest' }],
    },
    // Playwright modifier chains have the same nested shape
    {
      code: `test.describe.serial.skip('suite', () => {});`,
      errors: [{ messageId: 'disabledTest' }],
    },
    {
      code: `test.describe.parallel.skip('suite', () => {});`,
      errors: [{ messageId: 'disabledTest' }],
    },
  ],
});
