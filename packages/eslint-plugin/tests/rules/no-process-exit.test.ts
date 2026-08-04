import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-process-exit';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-process-exit', rule, {
  valid: [
    // Regular function calls
    { code: `console.log('hello');` },
    { code: `someFunction();` },
    // Non-call member access like process.env
    { code: `process.env;` },
    { code: `process.pid;` },
    // Other unrelated member calls
    { code: `foo.exit();` },
    { code: `bar.process.exit();` },
    // Bare exit call (not related to process)
    { code: `exit(1);` },
  ],
  invalid: [
    // process.exit()
    {
      code: `process.exit();`,
      errors: [{ messageId: 'noProcessExit' }],
    },
    // process.exit(1)
    {
      code: `process.exit(1);`,
      errors: [{ messageId: 'noProcessExit' }],
    },
  ],
});
