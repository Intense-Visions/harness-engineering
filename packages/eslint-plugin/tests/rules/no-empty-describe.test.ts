import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-empty-describe';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-empty-describe', rule, {
  valid: [
    // Regular describe with content
    { code: `describe('suite', () => { it('test', () => {}); });` },
    { code: `describe('suite', function() { it('test', () => {}); });` },
    { code: `describe('suite', () => { it('test', () => {}); it('another test', () => {}); });` },
    // Describe with statements
    { code: `describe('suite', () => { console.log('hello'); });` },
    { code: `describe('suite', () => { const x = 1; });` },
    // Empty describe with no callback
    { code: `describe('suite');` },
    // Regular function calls
    { code: `console.log('hello');` },
    { code: `someFunction();` },
  ],
  invalid: [
    // Empty describe block
    {
      code: `describe('suite', () => {});`,
      errors: [{ messageId: 'emptyDescribe' }],
    },
    {
      code: `describe('suite', function() {});`,
      errors: [{ messageId: 'emptyDescribe' }],
    },
    // Arrow function with explicit empty block
    {
      code: `describe('suite', () => {   });`,
      errors: [{ messageId: 'emptyDescribe' }],
    },
  ],
});
