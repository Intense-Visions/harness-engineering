// tests/rules/no-sync-io-in-async.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-sync-io-in-async';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-sync-io-in-async', rule, {
  valid: [
    // Sync fs in non-async function is fine
    {
      code: `function loadConfig() { const data = readFileSync('config.json'); }`,
    },
    // Sync fs at top level is fine
    {
      code: `const data = readFileSync('config.json');`,
    },
    // Async function with no sync fs calls
    {
      code: `async function load() { const data = await readFile('config.json'); }`,
    },
    // Sync fs in non-async arrow function
    {
      code: `const load = () => { readFileSync('config.json'); };`,
    },
    // fs.readFileSync in non-async function
    {
      code: `function load() { fs.readFileSync('config.json'); }`,
    },
  ],
  invalid: [
    // readFileSync in async function declaration
    {
      code: `async function load() { readFileSync('config.json'); }`,
      errors: [{ messageId: 'syncIoInAsync' }],
    },
    // writeFileSync in async arrow function
    {
      code: `const save = async () => { writeFileSync('out.json', data); };`,
      errors: [{ messageId: 'syncIoInAsync' }],
    },
    // existsSync in async function expression
    {
      code: `const check = async function() { existsSync('/tmp/file'); };`,
      errors: [{ messageId: 'syncIoInAsync' }],
    },
    // fs.readFileSync (member expression) in async function
    {
      code: `async function load() { fs.readFileSync('config.json'); }`,
      errors: [{ messageId: 'syncIoInAsync' }],
    },
    // Multiple sync calls in async function
    {
      code: `async function setup() { mkdirSync('/tmp/dir'); writeFileSync('/tmp/dir/f', ''); }`,
      errors: [{ messageId: 'syncIoInAsync' }, { messageId: 'syncIoInAsync' }],
    },
    // Nested async function
    {
      code: `async function outer() { async function inner() { statSync('/tmp'); } }`,
      errors: [{ messageId: 'syncIoInAsync' }],
    },
  ],
});
