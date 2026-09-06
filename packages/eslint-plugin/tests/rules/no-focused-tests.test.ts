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
    // Playwright's namespaced block API without a focus modifier — the
    // false-positive boundary for the chain walk below.
    { code: `test.describe('suite', () => {});` },
    { code: `test.describe.serial('suite', () => {});` },
    { code: `test.describe.parallel('suite', () => {});` },
    // `.skip` belongs to no-skipped-tests / no-disabled-tests. This rule owns
    // `.only` alone and must not start double-reporting skips.
    { code: `test.describe.skip('suite', () => {});` },
    { code: `test.skip('test', () => {});` },
    { code: `describe.skip('suite', () => {});` },
    // `only` on a receiver that is not a test global — someone else's API.
    { code: `rateLimiter.only('token');` },
    { code: `queue.batch.only();` },
    // Bare identifier call, no chain at all
    { code: `only('test', () => {});` },
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
    // Playwright's test.describe.only() — focuses a whole block and therefore
    // mutes every OTHER test in the file. The callee object is a
    // MemberExpression (`test.describe`), not an Identifier, so the original
    // flat-member guard never matched it (#1853).
    {
      code: `test.describe.only('suite', () => {});`,
      errors: [{ messageId: 'focusedTest' }],
    },
    // Playwright modifier chains — `only` is still the terminal link.
    {
      code: `test.describe.serial.only('suite', () => {});`,
      errors: [{ messageId: 'focusedTest' }],
    },
    {
      code: `test.describe.parallel.only('suite', () => {});`,
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
