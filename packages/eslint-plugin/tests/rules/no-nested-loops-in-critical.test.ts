// tests/rules/no-nested-loops-in-critical.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-nested-loops-in-critical';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-nested-loops-in-critical', rule, {
  valid: [
    // Single loop in @perf-critical function — OK
    {
      code: `/** @perf-critical */\nfunction process(n: number) { for (let i = 0; i < n; i++) { doWork(i); } }`,
    },
    // Nested loop in non-critical function (even if file has @perf-critical elsewhere) — OK
    {
      code: `/** @perf-critical */\nfunction hot() { return 1; }\nfunction cold(n: number) { for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { } } }`,
    },
    // No @perf-critical at all — skip entirely
    {
      code: `function f(n: number) { for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { } } }`,
    },
    // No loops in @perf-critical function
    {
      code: `/** @perf-critical */\nfunction fast() { return 1; }`,
    },
  ],
  invalid: [
    // Nested for loops in @perf-critical function
    {
      code: `/** @perf-critical */\nfunction process(n: number, m: number) { for (let i = 0; i < n; i++) { for (let j = 0; j < m; j++) { } } }`,
      errors: [{ messageId: 'nestedLoopInCritical' }],
    },
    // Nested while inside for in @perf-critical function
    {
      code: `/** @perf-critical */\nfunction process(n: number) { for (let i = 0; i < n; i++) { while (true) { break; } } }`,
      errors: [{ messageId: 'nestedLoopInCritical' }],
    },
    // Line comment annotation
    {
      code: `// @perf-critical\nfunction process(obj: any, arr: any[]) { for (const k in obj) { for (const v of arr) { } } }`,
      errors: [{ messageId: 'nestedLoopInCritical' }],
    },
  ],
});
