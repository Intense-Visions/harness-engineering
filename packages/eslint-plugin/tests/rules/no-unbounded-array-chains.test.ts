// tests/rules/no-unbounded-array-chains.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-unbounded-array-chains';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-unbounded-array-chains', rule, {
  valid: [
    // Single array method — fine
    {
      code: `const result = arr.filter(x => x > 0);`,
    },
    // Two chained operations — fine
    {
      code: `const result = arr.filter(x => x > 0).map(x => x * 2);`,
    },
    // Non-array method in chain breaks it
    {
      code: `const result = arr.filter(x => x > 0).join(',').split(',');`,
    },
  ],
  invalid: [
    // Three chained array operations
    {
      code: `const result = arr.filter(x => x > 0).map(x => x * 2).reduce((a, b) => a + b, 0);`,
      errors: [{ messageId: 'unboundedArrayChain' }],
    },
    // Four chained array operations
    {
      code: `const result = arr.filter(x => x).map(x => x.id).sort().find(x => x === 1);`,
      errors: [{ messageId: 'unboundedArrayChain' }],
    },
    // Three chains with flatMap
    {
      code: `const result = arr.flatMap(x => x).filter(Boolean).forEach(x => console.log(x));`,
      errors: [{ messageId: 'unboundedArrayChain' }],
    },
  ],
});
