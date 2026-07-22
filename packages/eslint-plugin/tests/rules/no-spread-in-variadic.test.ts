import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-spread-in-variadic';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-spread-in-variadic', rule, {
  valid: [
    // Plain (non-spread) args are safe.
    { code: `Math.min(a, b);` },
    { code: `Math.max(1, 2, 3);` },
    // Other Math methods are not variadic call-stack risks.
    { code: `Math.round(x);` },
    { code: `Math.floor(...xs);` },
    // Array spread / object spread are unrelated.
    { code: `const c = [...arr];` },
    { code: `const o = { ...obj };` },
    // Spread into a non-Math callee is out of scope.
    { code: `f(...args);` },
    { code: `foo.min(...args);` },
    // Computed member access is not the flagged form.
    { code: `Math['min'](...arr);` },
  ],
  invalid: [
    {
      code: `Math.min(...arr);`,
      errors: [{ messageId: 'spreadInVariadic' }],
    },
    {
      code: `Math.max(...values);`,
      errors: [{ messageId: 'spreadInVariadic' }],
    },
    // Spread mixed with plain args still flags.
    {
      code: `Math.min(0, ...arr);`,
      errors: [{ messageId: 'spreadInVariadic' }],
    },
    {
      code: `const peak = Math.max(...data.map((d) => d.value));`,
      errors: [{ messageId: 'spreadInVariadic' }],
    },
  ],
});
